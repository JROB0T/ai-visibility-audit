// ============================================================
// POST /api/checkout/tier
//
// Anonymous (no auth) checkout entry for the public /pricing page.
// Customer hits a "Buy" button → this route → Stripe Checkout →
// payment + email + domain collected by Stripe → success returns to
// our site. Phase 4b.2's webhook handler is what turns the completed
// session into a real audit + user account.
//
// Why no auth here: paid customers don't have accounts yet at this
// point in the funnel (free-scan signups create no account). Stripe
// collects the email itself; the webhook creates the auth user.
//
// Why Stripe-native custom_fields for domain: avoids needing a
// separate domain-collection step before checkout. The domain is
// captured in the same UI as payment, lives on the session, and the
// webhook reads it back via custom_fields.
//
// Body: { sku: TierSku }
// Returns: { url: string } — redirect target
//          { error: string } on validation / config failure
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import {
  isTierSku,
  resolveStripePriceId,
  stripeModeFor,
  tierOf,
  cadenceOf,
} from '@/lib/pricing';

export const maxDuration = 10;

interface CheckoutBody {
  sku?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sku = body.sku;
  if (!sku || !isTierSku(sku)) {
    return NextResponse.json(
      { error: 'Invalid sku', detail: `expected one of tier_1_one_time, tier_1_monthly, tier_2_one_time, tier_2_monthly; got ${String(sku)}` },
      { status: 400 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[CHECKOUT_TIER_ERROR]', { phase: 'config', reason: 'missing_stripe_secret_key' });
    return NextResponse.json(
      { error: 'Checkout not configured' },
      { status: 500 },
    );
  }

  const priceId = resolveStripePriceId(sku);
  if (!priceId) {
    console.error('[CHECKOUT_TIER_ERROR]', { phase: 'config', reason: 'missing_price_id', sku });
    return NextResponse.json(
      { error: 'Checkout not configured', detail: `Missing Stripe price ID for ${sku}` },
      { status: 500 },
    );
  }

  const origin = request.headers.get('origin')
    || process.env.NEXT_PUBLIC_APP_URL
    || 'https://example.com';
  // Trim trailing slash if present so the success/cancel URLs are clean.
  const cleanOrigin = origin.replace(/\/+$/, '');

  // Phase 4b.2 will read session_id from the success URL to look up
  // the just-completed session and finish provisioning.
  const successUrl = `${cleanOrigin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${cleanOrigin}/pricing?canceled=1`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: stripeModeFor(sku),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Stripe collects the buyer's email natively. The webhook reads
      // it back via session.customer_details.email when provisioning
      // the auth user.
      customer_creation: stripeModeFor(sku) === 'payment' ? 'always' : undefined,
      // Capture the domain inside the same Stripe checkout flow —
      // saves us a second UI step. Webhook reads this back from
      // session.custom_fields[*].text.value.
      custom_fields: [
        {
          key: 'domain',
          label: { type: 'custom', custom: 'Website to scan (e.g. example.com)' },
          type: 'text',
          text: { minimum_length: 4, maximum_length: 253 },
        },
      ],
      // Metadata is the bridge to the webhook handler. Tier + cadence
      // tell the webhook which kind of audit to create. The sku itself
      // is also recorded as a billing_events.event_type later.
      metadata: {
        sku,
        tier: tierOf(sku),
        cadence: cadenceOf(sku),
      },
      // For subscriptions, also pass metadata onto the subscription so
      // it survives renewals when checkout-session metadata isn't
      // available anymore.
      subscription_data:
        stripeModeFor(sku) === 'subscription'
          ? {
              metadata: {
                sku,
                tier: tierOf(sku),
                cadence: cadenceOf(sku),
              },
            }
          : undefined,
    });

    if (!session.url) {
      console.error('[CHECKOUT_TIER_ERROR]', { phase: 'session_create', reason: 'no_url', sku });
      return NextResponse.json(
        { error: 'Could not start checkout' },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || 'unknown';
    console.error('[CHECKOUT_TIER_ERROR]', {
      phase: 'session_create',
      sku,
      stripeCode: code,
      message,
    });
    return NextResponse.json(
      { error: 'Could not start checkout', detail: message },
      { status: 502 },
    );
  }
}
