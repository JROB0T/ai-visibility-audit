// ============================================================
// GET /api/audits/batch/[batchId]
//
// Status of all jobs in a batch. Owner-only (the caller must own
// the batch — either via API key or signed-in session).
//
// Response includes per-job state, plus when completed, the
// share_url, report_url, and key metrics from the snapshot.
//
// Designed for cheap polling: a single round-trip + a join, no
// per-job lookups.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireApiKeyOrOperatorSession } from '@/lib/apiAuth';
import type { AuditTier } from '@/lib/types';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<NextResponse> {
  const auth = await requireApiKeyOrOperatorSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { batchId } = await params;
  if (!batchId) {
    return NextResponse.json({ error: 'batchId required' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Ownership check happens via this single query — if created_by
  // doesn't match the caller, we 404 (don't distinguish "not found"
  // from "not yours" to avoid leaking existence).
  const { data: batch } = await admin
    .from('audit_batches')
    .select('id, created_by, created_at, notify_webhook')
    .eq('id', batchId)
    .maybeSingle();
  if (!batch || batch.created_by !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: jobs, error: jobsErr } = await admin
    .from('audit_jobs')
    .select('id, business_name, website, location, industry, tier, email, status, audit_id, error, created_at, started_at, completed_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  if (jobsErr) {
    console.error('[BATCH_STATUS_ERROR]', { phase: 'jobs_query', batchId, message: jobsErr.message });
    return NextResponse.json({ error: 'Could not load jobs' }, { status: 500 });
  }
  const jobRows = jobs || [];

  // Bulk-load snapshots for completed jobs so we can return scores/
  // share URLs without N round-trips.
  const completedAuditIds = jobRows
    .filter(j => j.audit_id && j.status === 'completed')
    .map(j => j.audit_id as string);
  const snapshotByAudit = new Map<string, {
    overall_score: number | null;
    prompt_count: number;
    absent_count: number;
    share_token: string | null;
  }>();
  if (completedAuditIds.length > 0) {
    // audits.site_id -> snapshot lookup. Join audit_id → site_id → snapshot.
    const { data: auditSiteRows } = await admin
      .from('audits')
      .select('id, site_id')
      .in('id', completedAuditIds);
    const siteByAudit = new Map<string, string>();
    for (const a of (auditSiteRows || [])) {
      siteByAudit.set(a.id as string, a.site_id as string);
    }
    const siteIds = Array.from(new Set(Array.from(siteByAudit.values())));
    if (siteIds.length > 0) {
      const { data: snapRows } = await admin
        .from('discovery_score_snapshots')
        .select('site_id, overall_score, prompt_count, absent_count, share_token, snapshot_date')
        .in('site_id', siteIds)
        .order('snapshot_date', { ascending: false });
      // First snapshot per site_id wins (most recent).
      const latestBySite = new Map<string, NonNullable<typeof snapRows>[number]>();
      for (const s of (snapRows || [])) {
        const sid = s.site_id as string;
        if (latestBySite.has(sid)) continue;
        latestBySite.set(sid, s);
      }
      for (const [auditId, siteId] of siteByAudit) {
        const snap = latestBySite.get(siteId);
        if (snap) {
          snapshotByAudit.set(auditId, {
            overall_score: (snap.overall_score as number | null) ?? null,
            prompt_count: (snap.prompt_count as number | null) ?? 0,
            absent_count: (snap.absent_count as number | null) ?? 0,
            share_token: (snap.share_token as string | null) ?? null,
          });
        }
      }
    }
  }

  const baseUrl = appBaseUrl(request);
  const counts = {
    total: jobRows.length,
    queued: jobRows.filter(j => j.status === 'queued').length,
    processing: jobRows.filter(j => j.status === 'processing').length,
    completed: jobRows.filter(j => j.status === 'completed').length,
    failed: jobRows.filter(j => j.status === 'failed').length,
  };

  const items = jobRows.map(j => {
    const auditId = j.audit_id as string | null;
    const snap = auditId ? snapshotByAudit.get(auditId) : undefined;
    const shareToken = snap?.share_token ?? null;
    return {
      job_id: j.id as string,
      business_name: (j.business_name as string | null) || (j.website as string),
      website: j.website as string,
      location: (j.location as string | null) ?? null,
      industry: (j.industry as string | null) ?? null,
      tier: j.tier as AuditTier,
      email: (j.email as string | null) ?? null,
      status: j.status as 'queued' | 'processing' | 'completed' | 'failed',
      audit_id: auditId,
      error: (j.error as string | null) ?? null,
      created_at: j.created_at as string,
      started_at: (j.started_at as string | null) ?? null,
      completed_at: (j.completed_at as string | null) ?? null,
      // Populated only when status='completed' AND a snapshot exists.
      overall_score: snap?.overall_score ?? null,
      grade: gradeFor(snap?.overall_score ?? null),
      prompts_tested: snap?.prompt_count ?? null,
      absent_count: snap?.absent_count ?? null,
      report_url: auditId ? `${baseUrl}/audit/${auditId}/report` : null,
      share_url: shareToken ? `${baseUrl}/r/${shareToken}` : null,
    };
  });

  return NextResponse.json({
    batch_id: batch.id,
    created_at: batch.created_at,
    counts,
    audits: items,
  });
}
