// ============================================================
// /api/discovery/rerun-now
//
// POST → trigger an immediate re-scan for a subscribed user.
//   Body: { siteId }
//
// Returns: { jobId } — same shape as run-and-report
//
// Auth: user must have active monthly subscription for this site.
// If not, returns 402 with `{ error: 'payment_required',
// checkout_required_for: 'rescan' }` so the UI can route to Stripe.
//
// Implementation: chains internally to /api/discovery/run-and-report
// which already implements the fire-and-forget pattern. We forward
// the user's auth cookies so run-and-report's auth check passes.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { checkRescanEntitlement } from '@/lib/entitlementCheck';
import { findActiveJobForSite } from '@/lib/discoveryJobs';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RerunRequest {
  siteId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RerunRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.siteId) {
    return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  }

  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const admin = getAdminClient();

  // Verify site ownership
  const { data: site } = await admin
    .from('sites')
    .select('id, user_id')
    .eq('id', body.siteId)
    .maybeSingle();
  if (!site || site.user_id !== user.id) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }

  // Entitlement check — must be a subscriber to use this endpoint
  const verdict = await checkRescanEntitlement(admin, user.id, body.siteId);
  if (!verdict.hasActiveSubscription) {
    return NextResponse.json(
      {
        error: 'payment_required',
        checkout_required_for: 'rescan',
      },
      { status: 402 },
    );
  }

  // Defensive: don't double-queue if a running job is already in flight
  const existing = await findActiveJobForSite(admin, body.siteId);
  if (existing && existing.status === 'running') {
    return NextResponse.json({ jobId: existing.id, alreadyRunning: true });
  }

  // Chain to run-and-report. Forward user's auth cookies so its
  // requireDiscoveryAccess check passes.
  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  const res = await fetch(`${origin}/api/discovery/run-and-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    },
    body: JSON.stringify({
      siteId: body.siteId,
      trigger: 'manual_rerun',
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: errBody.error || 'Failed to start re-run' },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json({
    jobId: data.jobId,
    alreadyRunning: data.alreadyRunning || false,
  });
}
