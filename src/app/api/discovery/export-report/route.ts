// ============================================================
// /api/discovery/export-report
//
// GET-only endpoint that returns the complete JSON payload a downstream
// report-rendering pipeline needs. Single source of truth for report content.
// No Claude polish here — raw data only. The report pipeline (Tickets 8+)
// runs its own narrative synthesis.
//
// Payload assembly lives in src/lib/report/exportPayload.ts (WO2
// Task 0) so offline tooling (scripts/repair-sevis-report.ts) and this
// route can never drift.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireFullDiscoveryAccess } from '@/lib/discoveryAccess';
import { buildReportExportPayload } from '@/lib/report/exportPayload';
import type { DiscoveryScoreSnapshot } from '@/lib/types';

export const maxDuration = 60;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query param required' }, { status: 400 });
  }
  const runIdInput = request.nextUrl.searchParams.get('runId');

  // Internal call from /api/discovery/run-and-report. The chained job
  // handler runs server-side and doesn't have user auth cookies; we
  // verify the supplied jobId is real, in 'running' state, and tied to
  // this exact siteId before bypassing the cookie auth.
  const internalJobHeader = request.headers.get('x-internal-job');
  const admin = getAdminClient();
  if (internalJobHeader) {
    const { data: job } = await admin
      .from('discovery_jobs')
      .select('id, site_id, status')
      .eq('id', internalJobHeader)
      .maybeSingle();
    if (!job || job.status !== 'running') {
      return NextResponse.json({ error: 'Invalid internal job reference' }, { status: 401 });
    }
    if (job.site_id !== siteId) {
      return NextResponse.json({ error: 'Job site mismatch' }, { status: 403 });
    }
    // Bypass cookie auth, proceed.
  } else {
    const auth = await requireFullDiscoveryAccess(request, siteId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Resolve run_id — specific or latest
  let runId = runIdInput;
  let runSnapshot: DiscoveryScoreSnapshot | null = null;
  if (runId) {
    const { data } = await admin
      .from('discovery_score_snapshots')
      .select('*')
      .eq('site_id', siteId)
      .eq('run_id', runId)
      .maybeSingle();
    runSnapshot = data as DiscoveryScoreSnapshot | null;
  } else {
    const { data } = await admin
      .from('discovery_score_snapshots')
      .select('*')
      .eq('site_id', siteId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    runSnapshot = data as DiscoveryScoreSnapshot | null;
    runId = runSnapshot?.run_id || null;
  }
  if (!runSnapshot || !runId) {
    return NextResponse.json({ error: 'No runs found for this site' }, { status: 404 });
  }

  const payload = await buildReportExportPayload(admin, siteId, runId, runSnapshot as DiscoveryScoreSnapshot);
  return NextResponse.json(payload);
}
