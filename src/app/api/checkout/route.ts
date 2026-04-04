import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { siteId, priceType } = await request.json();

    if (!siteId || !priceType) {
      return NextResponse.json({ error: 'siteId and priceType are required', detail: `siteId=${siteId}, priceType=${priceType}` }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify the site belongs to this user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, domain, user_id')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Site lookup failed:', { siteId, siteError });
      return NextResponse.json({ error: 'Site not found', detail: `siteId=${siteId}` }, { status: 404 });
    }

    if (site.user_id !== user.id) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Map priceType to Stripe price ID and mode
    const priceMap: Record<string, { envKey: string; mode: 'payment' | 'subscription' }> = {
      initial_scan: { envKey: 'STRIPE_PRICE_INITIAL_SCAN', mode: 'payment' },
      rescan: { envKey: 'STRIPE_PRICE_RESCAN', mode: 'payment' },
      monthly: { envKey: 'STRIPE_PRICE_MONTHLY', mode: 'subscription' },
    };

    const priceConfig = priceMap[priceType];
    if (!priceConfig) {
      return NextResponse.json({ error: 'Invalid priceType', detail: priceType }, { status: 400 });
    }

    const priceId = process.env[priceConfig.envKey];
    if (!priceId) {
      console.error(`Missing env var: ${priceConfig.envKey}`);
      return NextResponse.json({ error: 'Checkout configuration error', detail: `Missing ${priceConfig.envKey} env var` }, { status: 500 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Missing STRIPE_SECRET_KEY env var');
      return NextResponse.json({ error: 'Stripe not configured', detail: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
    }

    const origin = request.headers.get('origin') || 'https://aivisibilityaudit.com';
    const successUrl = `${origin}/site/${siteId}?checkout=success&type=${priceType}`;
    const cancelUrl = `${origin}/site/${siteId}?checkout=cancel`;

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: priceConfig.mode,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        customer_email: user.email,
        metadata: {
          userId: user.id,
          siteId,
          priceType,
        },
      });

      return NextResponse.json({ url: session.url });
    } catch (stripeError: unknown) {
      const message = stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error';
      const stripeCode = (stripeError as { code?: string })?.code || 'unknown';
      const stripeType = (stripeError as { type?: string })?.type || 'unknown';
      console.error('Stripe session creation failed:', {
        message,
        code: stripeCode,
        type: stripeType,
        priceId,
        priceType,
        mode: priceConfig.mode,
        siteId,
        userId: user.id,
      });
      return NextResponse.json({
        error: 'Failed to create checkout session',
        detail: message,
        stripeCode,
      }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Checkout route error:', message, error);
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 });
  }
}
