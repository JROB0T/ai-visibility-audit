// ============================================================
// Batch audit provisioning.
//
// Three responsibilities:
//
//   provisionBatchAuditPaid()
//     Create site + audit rows for a paid-tier batch job WITHOUT
//     going through Stripe. The batch endpoint is admin/operator-
//     driven — these aren't paying customers, they're prospect
//     samples the operator chose to issue.
//
//   runBatchJob(jobId)
//     The unit of work executed by the cron worker. Claims a
//     queued job, dispatches to runFreeScan or runPaidScan based
//     on the chosen tier, records completion.
//
//   claimNextQueuedJob()
//     Atomic single-job claim (status: queued → processing). Used
//     by the cron worker; safe against concurrent cron ticks.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runFreeScan } from '@/lib/freeScan';
import { runPaidScan } from '@/lib/paidScan';
import { normalizeDomain } from '@/lib/normalize';
import type { AuditTier } from '@/lib/types';

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ============================================================
// Types
// ============================================================

export interface BusinessInput {
  name?: string | null;
  website: string;        // required; will be normalised to domain
  location?: string | null;
  industry?: string | null;
  tier?: AuditTier;       // default 'free'
}

export interface BatchJobRow {
  id: string;
  batch_id: string;
  business_name: string | null;
  website: string;
  location: string | null;
  industry: string | null;
  tier: AuditTier;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  audit_id: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ============================================================
// provisionBatchAuditPaid — create site+audit without Stripe
// ============================================================

interface ProvisionParams {
  userId: string;         // batch.created_by — owns the resulting site
  domain: string;         // already normalised
  tier: 'tier_1' | 'tier_2';
}

interface ProvisionResult {
  auditId: string;
  siteId: string;
}

export async function provisionBatchAuditPaid(
  params: ProvisionParams,
): Promise<ProvisionResult> {
  const admin = getAdminClient();

  // Re-use an existing site for this (user, domain) when present so
  // batch retriggers don't create orphan duplicates. Mirrors the
  // convention in /api/audit/route.ts and src/lib/paidScan.ts.
  let siteId: string;
  const { data: existing } = await admin
    .from('sites')
    .select('id')
    .eq('user_id', params.userId)
    .eq('domain', params.domain)
    .maybeSingle();
  if (existing) {
    siteId = existing.id as string;
  } else {
    const { data: newSite, error: siteErr } = await admin
      .from('sites')
      .insert({
        user_id: params.userId,
        domain: params.domain,
        url: `https://${params.domain}`,
        plan_status: params.tier === 'tier_2' ? 'core_premium' : 'core',
      })
      .select('id')
      .single();
    if (siteErr || !newSite) {
      throw new Error(`batch: site insert failed: ${siteErr?.message || 'unknown'}`);
    }
    siteId = newSite.id as string;
  }

  const { data: audit, error: auditErr } = await admin
    .from('audits')
    .insert({
      site_id: siteId,
      user_id: params.userId,
      status: 'running',
      tier: params.tier,
      run_type: 'paid_initial',
      run_scope: 'core_plus_premium',
    })
    .select('id')
    .single();
  if (auditErr || !audit) {
    throw new Error(`batch: audit insert failed: ${auditErr?.message || 'unknown'}`);
  }

  return { auditId: audit.id as string, siteId };
}

// ============================================================
// Job lifecycle — claim, complete, fail
// ============================================================

/**
 * Atomically claim the oldest queued job. Returns the row on success,
 * null when no job was available (queue empty, or another worker
 * grabbed the head). Race-safe via the WHERE-status='queued' guard
 * on the UPDATE — Postgres ensures only one update wins.
 */
export async function claimNextQueuedJob(): Promise<BatchJobRow | null> {
  const admin = getAdminClient();

  const { data: candidates } = await admin
    .from('audit_jobs')
    .select('id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(5);

  for (const cand of candidates || []) {
    const { data: claimed, error } = await admin
      .from('audit_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempts: 1,
      })
      .eq('id', cand.id)
      .eq('status', 'queued')
      .select('*')
      .maybeSingle();
    if (!error && claimed) {
      return claimed as BatchJobRow;
    }
    // Lost the race for this row; try the next one.
  }
  return null;
}

/**
 * Mark stuck jobs (status='processing' for > 10 minutes) as failed.
 * Runs at the start of every cron tick so a function timeout doesn't
 * leave a job locked forever.
 */
export async function reapStuckJobs(): Promise<number> {
  const admin = getAdminClient();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('audit_jobs')
    .update({
      status: 'failed',
      error: 'reaped: processing exceeded 10 minutes',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('started_at', tenMinAgo)
    .select('id');
  if (error) {
    console.warn('[BATCH_REAP_WARN]', { message: error.message });
    return 0;
  }
  return (data || []).length;
}

async function markJobCompleted(jobId: string, auditId: string): Promise<void> {
  const admin = getAdminClient();
  await admin
    .from('audit_jobs')
    .update({
      status: 'completed',
      audit_id: auditId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

async function markJobFailed(jobId: string, message: string): Promise<void> {
  const admin = getAdminClient();
  await admin
    .from('audit_jobs')
    .update({
      status: 'failed',
      error: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

// ============================================================
// runBatchJob — the unit of work
// ============================================================

export async function runBatchJob(job: BatchJobRow): Promise<void> {
  const domain = normalizeDomain(job.website);
  if (!domain) {
    await markJobFailed(job.id, `invalid website: ${job.website}`);
    return;
  }

  // Load the batch's owner so paid-tier audits attach to the right
  // user_id (the operator who submitted the batch).
  const admin = getAdminClient();
  const { data: batch } = await admin
    .from('audit_batches')
    .select('created_by, notify_webhook')
    .eq('id', job.batch_id)
    .maybeSingle();
  if (!batch) {
    await markJobFailed(job.id, 'parent batch missing');
    return;
  }
  const userId = batch.created_by as string;

  try {
    let auditId: string;

    if (job.tier === 'free') {
      // runFreeScan creates its own site + audit. Uniqueness checks
      // are enforced upstream by the public form route — batch
      // submissions bypass that gate by design.
      const result = await runFreeScan({
        domain,
        requestId: `batch_job:${job.id}`,
      });
      auditId = result.auditId;
    } else {
      // Paid tier: create site + audit ourselves (no Stripe), then
      // hand to runPaidScan for the heavy lifting.
      const provision = await provisionBatchAuditPaid({
        userId,
        domain,
        tier: job.tier,
      });
      await runPaidScan({ auditId: provision.auditId });
      auditId = provision.auditId;
    }

    await markJobCompleted(job.id, auditId);

    // notify_webhook is captured on the batch but not delivered yet.
    // Real outbound HTTP requires retries, signatures, timeout
    // handling — stub for now, log so it's discoverable.
    if (batch.notify_webhook) {
      console.log('[WEBHOOK_NOTIFY_TODO]', {
        jobId: job.id,
        batchId: job.batch_id,
        auditId,
        url: batch.notify_webhook,
        // Real implementation would POST { batch_id, audit_id,
        // business_name, share_url, score } here.
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BATCH_JOB_ERROR]', {
      jobId: job.id,
      batchId: job.batch_id,
      tier: job.tier,
      website: job.website,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    await markJobFailed(job.id, message);
  }
}
