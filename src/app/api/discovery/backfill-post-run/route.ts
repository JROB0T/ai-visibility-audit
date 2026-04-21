// ============================================================
// POST /api/discovery/backfill-post-run
//
// Admin-only one-shot helper to (re)run the post-run hook (insights,
// recommendations, auto-competitors) for a past discovery run. Used to
// retroactively populate runs that finished before Ticket 7.7 shipped.
//
// Body: { siteId: string, runId?: string }
//   If runId is omitted, uses the latest snapshot's run_id for the site.
// Auth: admin bypass via requireDiscoveryAccess. Non-admin callers 403.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import { runPostRunHook } from '@/app/api/discovery/run-tests/route';
import type { DiscoveryResult, DiscoveryTier } from '@/lib/types';

export const maxDuration = 120;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const siteId = typeof body.siteId === 'string' ? body.siteId : null;
  const runIdInput = typeof body.runId === 'string' ? body.runId : null;
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  // Admin-only gate — still go through requireDiscoveryAccess for site-ownership,
  // then check isAdmin explicitly.
  const auth = await requireDiscoveryAccess(request, siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const admin = getAdminClient();

  // Resolve runId
  let runId = runIdInput;
  let tierFromResults: DiscoveryTier = 'full';
  if (!runId) {
    const { data: latest } = await admin
      .from('discovery_score_snapshots')
      .select('run_id')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.run_id || null;
  }
  if (!runId) {
    return NextResponse.json({ error: 'No runs found for this site' }, { status: 404 });
  }

  // Load results for the run
  const { data: resultRows, error: resultsErr } = await admin
    .from('discovery_results')
    .select('*')
    .eq('site_id', siteId)
    .eq('run_id', runId);
  if (resultsErr) {
    return NextResponse.json({ error: `Failed to load results: ${resultsErr.message}` }, { status: 500 });
  }
  const results = (resultRows || []) as DiscoveryResult[];
  if (results.length === 0) {
    return NextResponse.json({ error: 'Run has no results' }, { status: 404 });
  }

  // Derive tier from internal_notes (matches rest of pipeline)
  const firstNote = results[0]?.internal_notes;
  if (typeof firstNote === 'string' && firstNote.startsWith('tier:teaser')) tierFromResults = 'teaser';

  console.log(`[backfill-post-run] siteId=${siteId.slice(0, 8)} runId=${runId.slice(0, 8)} tier=${tierFromResults} results=${results.length}`);

  const outcome = await runPostRunHook(siteId, runId, tierFromResults, results);

  return NextResponse.json({
    runId,
    tier: tierFromResults,
    resultsCount: results.length,
    insightsCount: outcome.insightsCount,
    recommendationsCount: outcome.recommendationsCount,
    competitorsInserted: outcome.competitorsInserted,
    competitorsTotal: outcome.competitorsTotal,
    postRunStatus: outcome.status,
  });
}
