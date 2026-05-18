// ============================================================
// GET /api/audits/export
//
// Generic audit-data exporter. Returns one row per *completed* audit
// owned by the caller, with everything an outreach tool needs:
// business identity, score/grade, share URL, the two highest-priority
// prompts where the business is absent.
//
// Auth: API key (Bearer) OR signed-in session. The dashboard UI uses
// the session path; Clay/Instantly/etc. use the key.
//
// Query params:
//   format   csv | json          default: csv
//   limit    1..5000              default: 1000
//   since    ISO timestamp        only audits with completed_at >= this
//   tier     free | tier_1 | tier_2
//
// Output (CSV header / JSON keys):
//   audit_id, business_name, website, location, industry,
//   tier, overall_score, grade, share_url, report_url, absent_prompts,
//   top_missing_query_1, top_missing_query_2, generated_at
//
// In Phase 8 we'll add /api/audits/batch/[batchId]/export which
// internally calls this same data-fetch logic with an extra
// batch_id filter — the data shape is identical.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrSession } from '@/lib/apiAuth';
import type { AuditTier } from '@/lib/types';

export const maxDuration = 60;

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

function gradeFor(score: number | null): string {
  if (score === null) return '';
  if (score >= 90) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 70) return 'B';
  if (score >= 60) return 'B-';
  if (score >= 50) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 30) return 'D';
  return 'F';
}

export interface ExportRow {
  audit_id: string;
  business_name: string;
  website: string;
  location: string;
  industry: string;
  tier: AuditTier | '';
  overall_score: number | null;
  grade: string;
  share_url: string;
  report_url: string;
  absent_prompts: number;
  top_missing_query_1: string;
  top_missing_query_2: string;
  generated_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKeyOrSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get('format') === 'json' ? 'json' : 'csv';
  const limit = clampInt(params.get('limit'), 1, 5000, 1000);
  const since = params.get('since');
  const tierFilter = params.get('tier') as AuditTier | null;

  const admin = getAdminClient();
  const baseUrl = appBaseUrl(request);

  // ----- Load audits owned by this user -----
  let auditQuery = admin
    .from('audits')
    .select('id, site_id, tier, status, completed_at, created_at')
    .eq('user_id', auth.userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (since) auditQuery = auditQuery.gte('completed_at', since);
  if (tierFilter === 'free' || tierFilter === 'tier_1' || tierFilter === 'tier_2') {
    auditQuery = auditQuery.eq('tier', tierFilter);
  }
  const { data: audits, error: auditsErr } = await auditQuery;
  if (auditsErr) {
    console.error('[AUDITS_EXPORT_ERROR]', { phase: 'audit_list', message: auditsErr.message });
    return NextResponse.json({ error: 'Could not load audits' }, { status: 500 });
  }
  if (!audits || audits.length === 0) {
    if (format === 'json') return NextResponse.json({ rows: [] });
    return new NextResponse(csvHeader() + '\n', {
      status: 200,
      headers: csvHeaders('audits-empty'),
    });
  }

  // ----- Bulk-load related rows in three round-trips, not N per audit -----
  const siteIds = Array.from(new Set(audits.map(a => a.site_id as string)));

  const [
    { data: sites },
    { data: profiles },
    { data: latestSnapshots },
  ] = await Promise.all([
    admin.from('sites').select('id, domain, vertical').in('id', siteIds),
    admin
      .from('discovery_profiles')
      .select('site_id, business_name, primary_category, service_area')
      .in('site_id', siteIds),
    admin
      .from('discovery_score_snapshots')
      .select('id, site_id, run_id, overall_score, absent_count, share_token, snapshot_date')
      .in('site_id', siteIds)
      .order('snapshot_date', { ascending: false }),
  ]);

  const siteById = new Map<string, { domain: string; vertical: string | null }>();
  for (const s of (sites || [])) {
    siteById.set(s.id as string, {
      domain: (s.domain as string) || '',
      vertical: (s.vertical as string | null) ?? null,
    });
  }

  const profileBySite = new Map<string, { business_name: string | null; primary_category: string | null; service_area: string | null }>();
  for (const p of (profiles || [])) {
    profileBySite.set(p.site_id as string, {
      business_name: (p.business_name as string | null) ?? null,
      primary_category: (p.primary_category as string | null) ?? null,
      service_area: (p.service_area as string | null) ?? null,
    });
  }

  // For each site, latestSnapshots is pre-ordered; first hit wins.
  const snapshotBySite = new Map<string, {
    runId: string;
    overall_score: number | null;
    absent_count: number;
    share_token: string | null;
    snapshot_date: string;
  }>();
  for (const sn of (latestSnapshots || [])) {
    const sid = sn.site_id as string;
    if (snapshotBySite.has(sid)) continue;
    snapshotBySite.set(sid, {
      runId: sn.run_id as string,
      overall_score: (sn.overall_score as number | null) ?? null,
      absent_count: (sn.absent_count as number | null) ?? 0,
      share_token: (sn.share_token as string | null) ?? null,
      snapshot_date: (sn.snapshot_date as string) || new Date().toISOString(),
    });
  }

  // For top-missing prompts: one query per snapshot's run_id, limited to 2.
  // Worst-case: limit=1000 distinct runs = 1000 queries. Acceptable for
  // export volumes; revisit if it bottlenecks.
  const topMissingByRun = new Map<string, [string, string]>();
  const runIds = Array.from(new Set(Array.from(snapshotBySite.values()).map(s => s.runId)));
  await Promise.all(
    runIds.map(async (runId) => {
      const { data } = await admin
        .from('discovery_results')
        .select('prompt_text, prompt_score')
        .eq('run_id', runId)
        .eq('business_mentioned', false)
        .eq('business_cited', false)
        .order('prompt_score', { ascending: true })
        .limit(2);
      if (data && data.length > 0) {
        topMissingByRun.set(runId, [
          (data[0]?.prompt_text as string) || '',
          (data[1]?.prompt_text as string) || '',
        ]);
      }
    }),
  );

  // ----- Assemble rows -----
  const rows: ExportRow[] = audits.map(a => {
    const auditId = a.id as string;
    const siteId = a.site_id as string;
    const site = siteById.get(siteId);
    const profile = profileBySite.get(siteId);
    const snap = snapshotBySite.get(siteId);
    const missing = snap ? topMissingByRun.get(snap.runId) : undefined;

    const domain = site?.domain || '';
    const shareUrl = snap?.share_token ? `${baseUrl}/r/${snap.share_token}` : '';
    const reportUrl = `${baseUrl}/audit/${auditId}/report`;

    return {
      audit_id: auditId,
      business_name: profile?.business_name || domain,
      website: domain,
      location: profile?.service_area || '',
      industry: profile?.primary_category || site?.vertical || '',
      tier: (a.tier as AuditTier) || '',
      overall_score: snap?.overall_score ?? null,
      grade: gradeFor(snap?.overall_score ?? null),
      share_url: shareUrl,
      report_url: reportUrl,
      absent_prompts: snap?.absent_count ?? 0,
      top_missing_query_1: missing?.[0] || '',
      top_missing_query_2: missing?.[1] || '',
      generated_at: snap?.snapshot_date || (a.completed_at as string) || (a.created_at as string),
    };
  });

  // ----- Serialise -----
  if (format === 'json') {
    return NextResponse.json({ rows });
  }

  const csv = [csvHeader(), ...rows.map(rowToCsv)].join('\n');
  return new NextResponse(csv, { status: 200, headers: csvHeaders('audits-export') });
}

// ------------------------------------------------------------
// CSV helpers
// ------------------------------------------------------------

const CSV_COLUMNS: Array<keyof ExportRow> = [
  'audit_id',
  'business_name',
  'website',
  'location',
  'industry',
  'tier',
  'overall_score',
  'grade',
  'share_url',
  'report_url',
  'absent_prompts',
  'top_missing_query_1',
  'top_missing_query_2',
  'generated_at',
];

function csvHeader(): string {
  return CSV_COLUMNS.join(',');
}

function rowToCsv(row: ExportRow): string {
  return CSV_COLUMNS.map(col => csvCell(row[col])).join(',');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Quote if the cell contains comma, quote, newline, or starts/ends with
  // whitespace. Per RFC 4180 we double internal quotes.
  if (/[",\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvHeaders(filenameStem: string): HeadersInit {
  const datePart = new Date().toISOString().slice(0, 10);
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filenameStem}-${datePart}.csv"`,
    'Cache-Control': 'no-store',
  };
}

function clampInt(raw: string | null, lo: number, hi: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
