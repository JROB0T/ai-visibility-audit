// ============================================================
// /api/audit/[id]/site-readiness-deltas
//
// Returns deltas between this audit's sub-pillar scores and the
// previous COMPLETED audit for the same site.
//
// If there's no previous audit, returns deltas: null (the badge
// hides). If a sub-pillar score was null in either audit, that
// pillar's delta is null and the corresponding pill skips itself.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 10;

interface DeltasResponse {
  hasPrevious: boolean;
  previousAuditDate: string | null;
  deltas: {
    crawlability: number | null;
    machineReadability: number | null;
    commercialClarity: number | null;
    trustClarity: number | null;
    overall: number | null;
  } | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: auditId } = await params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get this audit's site_id, created_at, and sub-pillar scores
  const { data: thisAudit, error: thisErr } = await admin
    .from('audits')
    .select('id, site_id, created_at, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score')
    .eq('id', auditId)
    .maybeSingle();

  if (thisErr || !thisAudit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Find the most recent completed audit for the same site that's older than this one
  const { data: prev } = await admin
    .from('audits')
    .select('id, created_at, overall_score, crawlability_score, machine_readability_score, commercial_clarity_score, trust_clarity_score')
    .eq('site_id', thisAudit.site_id)
    .eq('status', 'completed')
    .lt('created_at', thisAudit.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prev) {
    const empty: DeltasResponse = { hasPrevious: false, previousAuditDate: null, deltas: null };
    return NextResponse.json(empty);
  }

  const diff = (curr: number | null, last: number | null): number | null => {
    if (curr === null || last === null) return null;
    return curr - last;
  };

  const response: DeltasResponse = {
    hasPrevious: true,
    previousAuditDate: prev.created_at as string,
    deltas: {
      crawlability: diff(thisAudit.crawlability_score, prev.crawlability_score),
      machineReadability: diff(thisAudit.machine_readability_score, prev.machine_readability_score),
      commercialClarity: diff(thisAudit.commercial_clarity_score, prev.commercial_clarity_score),
      trustClarity: diff(thisAudit.trust_clarity_score, prev.trust_clarity_score),
      overall: diff(thisAudit.overall_score, prev.overall_score),
    },
  };

  return NextResponse.json(response);
}
