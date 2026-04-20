import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminAccount } from '@/lib/entitlements';
import { runDiscoveryTests } from '@/lib/discoveryRunner';

export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const promptIds = Array.isArray(body.promptIds)
    ? (body.promptIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : undefined;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const isAdmin = isAdminAccount(user.email);

  // Ownership check
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, user_id')
    .eq('id', siteId)
    .maybeSingle();
  if (siteErr || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  }
  if (!isAdmin && site.user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this site' }, { status: 403 });
  }

  // Entitlement gate — non-admins need can_view_core on this site (same gate as generate-fixes)
  if (!isAdmin) {
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('can_view_core')
      .eq('user_id', user.id)
      .eq('site_id', siteId)
      .single();
    if (!entitlement?.can_view_core) {
      return NextResponse.json({ error: 'Premium feature — purchase required' }, { status: 403 });
    }
  }

  try {
    const run = await runDiscoveryTests({
      siteId,
      promptIds,
      triggeredBy: isAdmin ? 'admin' : 'user',
    });
    return NextResponse.json({
      runId: run.runId,
      summary: {
        overall_score: run.snapshot.overall_score,
        cluster_scores: run.snapshot.cluster_scores,
        counts: {
          prompt_count: run.snapshot.prompt_count,
          strong_count: run.snapshot.strong_count,
          partial_count: run.snapshot.partial_count,
          absent_count: run.snapshot.absent_count,
          competitor_dominant_count: run.snapshot.competitor_dominant_count,
        },
      },
      resultsCount: run.results.length,
      errorsCount: run.errors.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[discovery/run-tests] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
