export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

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
          // Create billing event
          await supabase.from('billing_events').insert({
            user_id: userId,
            site_id: siteId,
            event_type: 'manual_rescan',
            stripe_session_id: session.id,
            amount_cents: session.amount_total || 3500,
          });

          // Look up previous completed audit
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

          await supabase.from('audits').insert({
            site_id: siteId,
            user_id: userId,
            status: 'pending',
            run_type: 'manual_paid_rescan',
            run_scope: 'core_plus_premium',
            previous_audit_id: previousAuditId,
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

        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Still return 200 to prevent Stripe retries for processing errors
  }

  return NextResponse.json({ received: true });
}
