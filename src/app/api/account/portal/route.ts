// ============================================================
// POST /api/account/portal
//
// Creates a Stripe Customer Portal session for the signed-in user
// and returns the URL. The portal is Stripe-hosted and lets the
// customer:
//   - Update payment method
//   - View invoices
//   - Cancel or reactivate their subscription
//
// We look up the user's stripe_customer_id by joining sites where
// user_id matches. The first site with a customer ID wins — in
// practice each user has one (subscription is per-account, not
// per-site).
//
// Returns:
//   200 { url: "https://billing.stripe.com/..." }
//   401 if not signed in
//   404 if the user has no Stripe customer yet (e.g. only Free Sample)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export const maxDuration = 15;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function appBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host');
  const isLocalhost = host ? /^(localhost|127\.|0\.0\.0\.0)/i.test(host) : false;
  if (host) return `${isLocalhost ? 'http' : 'https'}://${host}`;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 500 });
  }

  const admin = getAdminClient();
  const { data: sites } = await admin
    .from('sites')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null)
    .limit(1);

  const customerId = sites?.[0]?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return NextResponse.json(
      { error: 'No billing account found. Subscribe to a paid plan first.' },
      { status: 404 },
    );
  }

  try {
    const baseUrl = appBaseUrl(request);
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard/account`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[ACCOUNT_PORTAL_ERROR]', err);
    return NextResponse.json(
      { error: 'Could not open billing portal. Try again or contact support.' },
      { status: 500 },
    );
  }
}
