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
//   top_missing_query_1, top_missing_query_2, email,
//   outreach_subject, outreach_body, generated_at
//
// email / outreach_subject / outreach_body are for cold-outreach
// workflows. `email` is the contact address from the batch-upload
// CSV (blank for non-batch audits). `outreach_*` are pre-written
// snippets built from the same template as the per-audit /outreach-
// email endpoint so on-screen and exported copy stay in sync.
//
// In Phase 8 we'll add /api/audits/batch/[batchId]/export which
// internally calls this same data-fetch logic with an extra
// batch_id filter — the data shape is identical.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrOperatorSession } from '@/lib/apiAuth';
import type { AuditTier } from '@/lib/types';
import { getDisplayPricing, formatDollars } from '@/lib/pricing';
import { buildOutreachEmail } from '@/lib/outreachEmail';

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
  email: string;
  outreach_subject: string;
  outreach_body: string;
  generated_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKeyOrOperatorSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = request.nextUrl.searchParams;
  const format = params.get('format') === 'json' ? 'json' : 'csv';
  const limit = clampInt(params.get('limit'), 1, 5000, 1000);
  const since = params.get('since');
  const tierFilter = params.get('tier') as AuditTier | null;
  // audit_ids filter — used by the batch-scoped wrapper at
  // /api/audits/batch/[batchId]/export, but also callable directly
  // by integrations that hold their own audit-id list.
  const auditIdsRaw = params.get('audit_ids');
  const auditIdsFilter = auditIdsRaw
    ? auditIdsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0)
    : null;

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
  if (auditIdsFilter && auditIdsFilter.length > 0) {
    auditQuery = auditQuery.in('id', auditIdsFilter);
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

  // ----- Bulk-load related rows in a few round-trips, not N per audit -----
  const siteIds = Array.from(new Set(audits.map(a => a.site_id as string)));
  const allAuditIds = audits.map(a => a.id as string);

  const [
    { data: sites },
    { data: profiles },
    { data: latestSnapshots },
    { data: jobs },
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
    // audit_jobs carries the contact email from the batch CSV. Only
    // populated for audits created via /api/audits/batch — manual
    // dashboard scans have no matching row, hence the left-join
    // shape (lookup returns undefined → empty email).
    admin
      .from('audit_jobs')
      .select('audit_id, email')
      .in('audit_id', allAuditIds),
  ]);

  const emailByAudit = new Map<string, string>();
  for (const j of (jobs || [])) {
    const aid = j.audit_id as string | null;
    const e = (j.email as string | null) ?? '';
    if (aid && e) emailByAudit.set(aid, e);
  }

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

  // Tier 1 pricing for outreach snippets — pulled once per export.
  const pricing = getDisplayPricing();
  const monthlyPrice = formatDollars(pricing.tier_1.monthly);
  const oneTimePrice = formatDollars(pricing.tier_1.oneTime);
  const pricingUrl = `${baseUrl}/pricing`;

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
    const businessName = profile?.business_name || domain;
    const score = snap?.overall_score ?? 0;
    const grade = gradeFor(snap?.overall_score ?? null);

    // Pre-written outreach copy. Same template as /api/audit/[id]/
    // outreach-email — built from a shared lib so they can't drift.
    const { subject: outreachSubject, body: outreachBody } = buildOutreachEmail({
      businessName,
      score,
      grade,
      shareUrl,
      pricingUrl,
      monthlyPrice,
      oneTimePrice,
      topMissingQuery1: missing?.[0] || '',
      topMissingQuery2: missing?.[1] || '',
    });

    return {
      audit_id: auditId,
      business_name: businessName,
      website: domain,
      location: profile?.service_area || '',
      industry: profile?.primary_category || site?.vertical || '',
      tier: (a.tier as AuditTier) || '',
      overall_score: snap?.overall_score ?? null,
      grade,
      share_url: shareUrl,
      report_url: reportUrl,
      absent_prompts: snap?.absent_count ?? 0,
      top_missing_query_1: missing?.[0] || '',
      top_missing_query_2: missing?.[1] || '',
      email: emailByAudit.get(auditId) || '',
      outreach_subject: outreachSubject,
      outreach_body: outreachBody,
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
  'email',
  'outreach_subject',
  'outreach_body',
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
