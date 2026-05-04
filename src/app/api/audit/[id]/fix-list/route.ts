// ============================================================
// /api/audit/[id]/fix-list
//
// GET → unified fix list for an audit. Combines:
//   - audit_recommendations (technical: schema, page-level fixes)
//   - discovery_recommendations (strategic: content, positioning)
//
// Each item is normalized to a common shape so the UI doesn't need
// to know which source it came from. Status (open/done/skipped) from
// fix_list_items is overlaid; items without a row default to 'open'.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 10;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type FixListSource = 'audit' | 'discovery';
export type FixListStatus = 'open' | 'done' | 'skipped';
export type FixListOwnerType = 'developer' | 'marketer' | 'business_owner';
export type FixListPriority = 'high' | 'medium' | 'low';

export interface UnifiedFixItem {
  id: string;
  source: FixListSource;
  status: FixListStatus;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  code_snippet: string | null;
  category: string | null;
  priority: FixListPriority;
  owner_type: FixListOwnerType;
  effort: FixListPriority | null;
  impact: FixListPriority | null;
  affected_urls: string[];
  notes: string | null;
  updated_at: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: auditId } = await params;
  const admin = getAdminClient();

  const { data: audit, error: auditErr } = await admin
    .from('audits')
    .select('id, site_id, tier')
    .eq('id', auditId)
    .maybeSingle();
  if (auditErr || !audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Tier gate: fix list is a Tier 2 feature. The dashboard already hides
  // the Priorities tab for non-tier_2 audits, but the API must enforce
  // independently — direct calls (cURL, scripts) bypass the UI.
  // NOTE: this endpoint also lacks an ownership/auth check (pre-existing —
  // any audit id can be queried). That's a separate security item, not
  // addressed here.
  if (audit.tier !== 'tier_2') {
    return NextResponse.json(
      { error: 'The operational fix list is available on Tier 2 only.' },
      { status: 403 },
    );
  }

  // Audit recommendations + their findings (for affected URLs)
  const { data: auditRecs } = await admin
    .from('audit_recommendations')
    .select('id, audit_id, finding_id, category, severity, effort, title, why_it_matters, recommended_fix, code_snippet, priority_order')
    .eq('audit_id', auditId)
    .order('priority_order', { ascending: true });

  const findingIds = (auditRecs || [])
    .map((r) => r.finding_id)
    .filter((x): x is string => !!x);
  const findingsResp = findingIds.length
    ? await admin.from('audit_findings').select('id, affected_urls').in('id', findingIds)
    : { data: [] as Array<{ id: string; affected_urls: string[] }> };
  const findings = findingsResp.data || [];
  const findingMap = new Map<string, string[]>();
  for (const f of findings) {
    findingMap.set(f.id as string, (f.affected_urls as string[]) || []);
  }

  // Latest discovery snapshot's run_id (so we don't stack across runs)
  const { data: latestSnapshot } = await admin
    .from('discovery_score_snapshots')
    .select('run_id')
    .eq('site_id', audit.site_id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestRunId = latestSnapshot?.run_id || null;

  const discoveryRecsResp = latestRunId
    ? await admin
        .from('discovery_recommendations')
        .select('id, site_id, run_id, title, description, why_it_matters, category, priority, owner_type, impact_estimate, difficulty_estimate, suggested_timeline')
        .eq('site_id', audit.site_id)
        .eq('run_id', latestRunId)
    : { data: [] as Array<Record<string, unknown>> };
  const discoveryRecs = discoveryRecsResp.data || [];

  const { data: statuses } = await admin
    .from('fix_list_items')
    .select('source, source_id, status, notes, updated_at')
    .eq('audit_id', auditId);
  const statusMap = new Map<string, { status: FixListStatus; notes: string | null; updated_at: string }>();
  for (const s of statuses || []) {
    statusMap.set(`${s.source}:${s.source_id}`, {
      status: s.status as FixListStatus,
      notes: (s.notes as string) || null,
      updated_at: s.updated_at as string,
    });
  }

  const items: UnifiedFixItem[] = [];

  for (const r of auditRecs || []) {
    const status = statusMap.get(`audit:${r.id}`);
    items.push({
      id: r.id as string,
      source: 'audit',
      status: status?.status || 'open',
      title: r.title as string,
      description: r.recommended_fix as string,
      why_it_matters: r.why_it_matters as string,
      code_snippet: (r.code_snippet as string | null) ?? null,
      category: r.category as string,
      priority: severityToPriority(r.severity as string),
      owner_type: 'developer',
      effort: effortToPriority(r.effort as string),
      impact: severityToPriority(r.severity as string),
      affected_urls: r.finding_id ? findingMap.get(r.finding_id as string) || [] : [],
      notes: status?.notes ?? null,
      updated_at: status?.updated_at ?? null,
    });
  }

  for (const r of discoveryRecs) {
    const status = statusMap.get(`discovery:${r.id}`);
    items.push({
      id: r.id as string,
      source: 'discovery',
      status: status?.status || 'open',
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      why_it_matters: (r.why_it_matters as string | null) ?? null,
      code_snippet: null,
      category: (r.category as string | null) ?? null,
      priority: ((r.priority as FixListPriority | null) || 'medium'),
      owner_type: ((r.owner_type as FixListOwnerType | null) || 'business_owner'),
      effort: (r.difficulty_estimate as FixListPriority | null) ?? null,
      impact: (r.impact_estimate as FixListPriority | null) ?? null,
      affected_urls: [],
      notes: status?.notes ?? null,
      updated_at: status?.updated_at ?? null,
    });
  }

  // Sort: open first (by priority), then done, then skipped
  items.sort((a, b) => {
    const statusRank = { open: 0, done: 1, skipped: 2 } as const;
    const sa = statusRank[a.status];
    const sb = statusRank[b.status];
    if (sa !== sb) return sa - sb;
    const pri = { high: 0, medium: 1, low: 2 } as const;
    return pri[a.priority] - pri[b.priority];
  });

  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;
  const open = total - done - skipped;

  return NextResponse.json({
    items,
    stats: { total, open, done, skipped },
  });
}

function severityToPriority(s: string): FixListPriority {
  if (s === 'high') return 'high';
  if (s === 'low') return 'low';
  return 'medium';
}

function effortToPriority(e: string): FixListPriority {
  if (e === 'easy') return 'low';
  if (e === 'harder') return 'high';
  return 'medium';
}
