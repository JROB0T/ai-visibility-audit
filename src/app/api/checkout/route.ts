import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const { siteId, priceType } = await request.json();

    if (!siteId || !priceType) {
      return NextResponse.json({ error: 'siteId and priceType are required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify the site belongs to this user
    const { data: site } = await supabase
      .from('sites')
      .select('id, domain, user_id')
      .eq('id', siteId)
      .single();

    if (!site || site.user_id !== user.id) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Map priceType to Stripe price ID and mode
    const priceMap: Record<string, { priceId: string; mode: 'payment' | 'subscription' }> = {
      initial_scan: { priceId: process.env.STRIPE_PRICE_INITIAL_SCAN!, mode: 'payment' },
      rescan: { priceId: process.env.STRIPE_PRICE_RESCAN!, mode: 'payment' },
      monthly: { priceId: process.env.STRIPE_PRICE_MONTHLY!, mode: 'subscription' },
    };

    const priceConfig = priceMap[priceType];
    if (!priceConfig) {
      return NextResponse.json({ error: 'Invalid priceType' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'https://aivisibilityaudit.com';
    const successUrl = `${origin}/site/${siteId}?checkout=success&type=${priceType}`;
    const cancelUrl = `${origin}/site/${siteId}?checkout=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: priceConfig.mode,
      line_items: [{ price: priceConfig.priceId, quantity: 1 }],
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
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
