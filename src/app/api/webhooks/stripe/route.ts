export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { isTierSku } from '@/lib/pricing';
import { provisionPaidScan } from '@/lib/paidScan';
import { sendPastDueEmail } from '@/lib/email';

// Use service role for webhook — no user auth context
function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getAdminSupabase();

  try {
    console.log('[stripe-webhook] Event received:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // ----- Phase 4b.2 path: new tier SKUs -----
        // The /pricing → /api/checkout/tier flow stamps metadata.sku
        // with a TierSku value. When we see one, this is an anonymous
        // first-time purchase: provision the user/site/audit here
        // and fire the worker. The legacy `priceType` branch below
        // is left intact for in-app upgrade flows.
        const newSku = session.metadata?.sku;
        if (newSku && isTierSku(newSku)) {
          try {
            const result = await provisionPaidScan(session);
            if (!result.alreadyProvisioned && result.auditId) {
              // Fire the long-running worker fire-and-forget. We
              // intentionally do NOT await the response — the worker
              // takes 60-90s and Stripe expects this webhook back in
              // < 30s. keepalive=true tells the runtime to let the
              // request finish even after the handler returns.
              const origin = request.headers.get('origin')
                || process.env.NEXT_PUBLIC_APP_URL
                || `https://${request.headers.get('host') || 'localhost'}`;
              const cleanOrigin = origin.replace(/\/+$/, '');
              const workerUrl = `${cleanOrigin}/api/internal/paid-scan/run`;
              const token = process.env.ADMIN_TRIGGER_TOKEN;
              if (token) {
                void fetch(workerUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ auditId: result.auditId }),
                  keepalive: true,
                }).catch(err => {
                  console.error('[stripe-webhook] worker dispatch failed:', err);
                });
              } else {
                console.error('[stripe-webhook] missing ADMIN_TRIGGER_TOKEN; worker not dispatched');
              }
            }
          } catch (err) {
            console.error('[stripe-webhook] provisionPaidScan failed:', err);
            // Still return 200 so Stripe doesn't retry on a logical
            // bug. The audit (if it was partially created) will be
            // visible in the DB for manual repair.
          }
          break;
        }

        // ----- Legacy path: in-app upgrade flows -----
        const userId = session.metadata?.userId;
        const siteId = session.metadata?.siteId;
        const priceType = session.metadata?.priceType;

        if (!userId || !siteId || !priceType) {
          console.error('Missing metadata in checkout session:', session.id);
          break;
        }

        if (priceType === 'initial_scan') {
          // Grant full entitlements
          console.log('[stripe-webhook] Writing entitlement for user:', userId);
          const { error: entitlementError } = await supabase.from('entitlements').upsert({
            user_id: userId,
            site_id: siteId,
            can_view_core: true,
            can_view_growth_strategy: true,
            can_view_marketing_perception: true,
            can_export: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,site_id' });
          if (entitlementError) {
            console.error('[stripe-webhook] Entitlement write failed:', entitlementError);
          } else {
            console.log('[stripe-webhook] Entitlement write succeeded');
          }

          // Update site plan
          await supabase.from('sites').update({
            plan_status: 'core_premium',
            stripe_customer_id: session.customer as string || null,
          }).eq('id', siteId);

          // Create billing event
          await supabase.from('billing_events').insert({
            user_id: userId,
            site_id: siteId,
            event_type: 'initial_scan',
            stripe_session_id: session.id,
            amount_cents: session.amount_total || 5000,
          });

          // Look up previous completed audit for delta tracking
          let previousAuditId: string | null = null;
          const { data: prevAudit } = await supabase
            .from('audits')
            .select('id')
            .eq('site_id', siteId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (prevAudit) previousAuditId = prevAudit.id;

          // Create a new audit record — the actual scan will be triggered by a separate process
          // For now, create the record so the user sees it
          await supabase.from('audits').insert({
            site_id: siteId,
            user_id: userId,
            status: 'pending',
            run_type: 'paid_initial',
            run_scope: 'core_plus_premium',
            previous_audit_id: previousAuditId,
          });
        }

        if (priceType === 'rescan') {
          // Record the billing event
          await supabase.from('billing_events').insert({
            user_id: userId,
            site_id: siteId,
            event_type: 'manual_paid_rescan',
            stripe_session_id: session.id,
            amount_cents: session.amount_total || 3500,
          });

          // Round 1.3: re-runs are discovery-only. Audit re-crawls happen
          // at initial purchase and via monthly cron for subscribers — not
          // on Tier 1 paid re-runs. The previous version of this branch
          // inserted a `pending` audit row that no process picked up; those
          // orphans are documented for manual cleanup in
          // docs/orphan-audit-cleanup.md.
          //
          // Webhooks should respond fast (Stripe expects ~5s) and don't
          // have user auth cookies for downstream auth checks. So we record
          // the user's intent here as a pending discovery_job; the success
          // page picks it up in the user's authenticated context and POSTs
          // to /api/discovery/run-and-report which runs the work.
          await supabase.from('discovery_jobs').insert({
            site_id: siteId,
            user_id: userId,
            trigger_source: 'manual_rerun',
            status: 'pending',
            progress_message: 'Awaiting kickoff…',
          });
        }

        if (priceType === 'monthly') {
          const subscriptionId = session.subscription as string || null;

          // Update entitlements
          console.log('[stripe-webhook] Writing entitlement for user:', userId);
          const { error: monthlyEntitlementError } = await supabase.from('entitlements').upsert({
            user_id: userId,
            site_id: siteId,
            can_view_core: true,
            can_view_growth_strategy: true,
            can_view_marketing_perception: true,
            can_export: true,
            has_monthly_monitoring: true,
            monthly_scope: 'core_premium',
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,site_id' });
          if (monthlyEntitlementError) {
            console.error('[stripe-webhook] Entitlement write failed:', monthlyEntitlementError);
          } else {
            console.log('[stripe-webhook] Entitlement write succeeded');
          }

          // Update site
          const nextScan = new Date();
          nextScan.setDate(nextScan.getDate() + 30);

          await supabase.from('sites').update({
            has_monthly_monitoring: true,
            monthly_scope: 'core_premium',
            stripe_subscription_id: subscriptionId,
            next_scheduled_scan_at: nextScan.toISOString(),
          }).eq('id', siteId);

          // Create billing event
          await supabase.from('billing_events').insert({
            user_id: userId,
            site_id: siteId,
            event_type: 'monthly_subscription',
            stripe_session_id: session.id,
            amount_cents: session.amount_total || 2500,
          });
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        // Find the site with this subscription
        const { data: site } = await supabase
          .from('sites')
          .select('id, user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (site) {
          console.log('[stripe-webhook] Writing entitlement for user:', site.user_id);
          await supabase.from('sites').update({
            has_monthly_monitoring: false,
            next_scheduled_scan_at: null,
          }).eq('id', site.id);

          const { error: deleteEntitlementError } = await supabase.from('entitlements').update({
            has_monthly_monitoring: false,
            monthly_scope: null,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq('site_id', site.id).eq('user_id', site.user_id);
          if (deleteEntitlementError) {
            console.error('[stripe-webhook] Entitlement write failed:', deleteEntitlementError);
          } else {
            console.log('[stripe-webhook] Entitlement write succeeded');
          }
        }

        // Phase 4b.2: also mark the new-flow `subscriptions` row as
        // canceled if the subscription_id matches. Subscriptions
        // created by the legacy path won't have a row here — that's
        // expected; the maybeSingle update is a no-op in that case.
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscriptionId);

        break;
      }

      // ============================================================
      // Phase 4b.2: subscription lifecycle for new-flow customers
      // ============================================================

      case 'invoice.payment_failed': {
        // Dunning step. Mark the subscription past_due and notify the
        // customer so they can update billing. Phase 5's cron will
        // skip past_due subscriptions when computing next_run_at.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id || null;
        if (!subscriptionId) break;

        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('id, user_id, domain')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();

        if (!subRow) {
          // Not one of ours (legacy flow or stale row) — skip.
          break;
        }

        await supabase
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('id', subRow.id);

        // Send past-due notification. Look up the user's email via
        // the admin API (auth.users isn't queryable through PostgREST).
        try {
          const { data: userRow } = await supabase.auth.admin.getUserById(subRow.user_id as string);
          const email = userRow.user?.email;
          if (email) {
            // The Stripe customer portal URL would ideally be a
            // generated session URL. Phase 5 wires that; for now we
            // link to a static /billing route stub the customer can
            // navigate from after sign-in.
            await sendPastDueEmail({
              to: email,
              domain: (subRow.domain as string) || '',
              billingPortalUrl: '/billing',
            });
          }
        } catch (err) {
          console.error('[stripe-webhook] past_due email lookup failed:', err);
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        // Fires on every successful invoice — initial subscription
        // creation AND each monthly renewal. We only care about
        // renewals here (initial creation is handled by
        // checkout.session.completed which provisions everything).
        // billing_reason='subscription_cycle' means a renewal.
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id || null;
        if (!subscriptionId) break;

        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('id, user_id, domain, tier')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle();
        if (!subRow) break;

        // Record the renewal as a billing event for accounting.
        await supabase.from('billing_events').insert({
          user_id: subRow.user_id,
          site_id: null,
          event_type: 'monthly_renewal',
          stripe_invoice_id: invoice.id,
          amount_cents: invoice.amount_paid || 0,
        });

        // Re-mark active in case we'd previously flipped to past_due.
        await supabase
          .from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', subRow.id);

        // The actual rerun is fired by Phase 5's hourly cron, which
        // reads subscriptions.next_run_at <= NOW(). We don't touch
        // next_run_at here — provisionPaidScan set it to +30d at
        // initial creation, and the cron advances it on each successful
        // rerun.
        break;
      }

      case 'customer.subscription.updated': {
        // Status transitions outside of explicit cancel / delete
        // (e.g. unpaid → active when customer fixes their card,
        // paused/resumed). Mirror status onto our subscriptions row.
        const subscription = event.data.object as Stripe.Subscription;
        const stripeStatus = subscription.status;
        const mapped =
          stripeStatus === 'active' ? 'active'
          : stripeStatus === 'past_due' ? 'past_due'
          : stripeStatus === 'canceled' ? 'canceled'
          : stripeStatus === 'paused' ? 'paused'
          : null;
        if (!mapped) break;

        await supabase
          .from('subscriptions')
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id);

        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Still return 200 to prevent Stripe retries for processing errors
  }

  return NextResponse.json({ received: true });
}
