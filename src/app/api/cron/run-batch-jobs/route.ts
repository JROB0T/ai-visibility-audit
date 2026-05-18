// ============================================================
// GET /api/cron/run-batch-jobs
//
// Vercel Cron handler. Picks up at most ONE queued audit_jobs row
// per tick, runs it (60-90s), and returns. The schedule in
// vercel.json determines throughput — running every 5 minutes
// gives 12 jobs/hour, plenty for prospecting volume.
//
// Why one-per-tick instead of fanning out: Vercel function
// maxDuration is 300s for a single invocation. Discovery scans
// take 60-90s. Running 2-3 in parallel inside one tick wastes
// budget on cron overhead. Running sequentially across ticks
// also keeps the failure blast radius small (one bad domain
// can't poison a whole batch).
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
// when that env var is set. We accept both that and the operator's
// ADMIN_TRIGGER_TOKEN so the route can be hit manually for
// debugging without rotating the cron secret.
//
// Each tick:
//   1. Reap stuck-processing jobs (>10 min)
//   2. Atomically claim the oldest queued job
//   3. Run it (calls runFreeScan or provisionBatchAuditPaid + runPaidScan)
//   4. Return { reaped, ran: jobId | null }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  claimNextQueuedJob,
  reapStuckJobs,
  runBatchJob,
} from '@/lib/batchProvisioning';

export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const presented = match[1].trim();

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length >= 8 && presented === cronSecret) return true;
  // Fallback for manual operator-triggered runs (debugging, backfill).
  const adminToken = process.env.ADMIN_TRIGGER_TOKEN;
  if (adminToken && adminToken.length >= 8 && presented === adminToken) return true;
  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 1 — reap stuck jobs (best-effort).
  let reaped = 0;
  try {
    reaped = await reapStuckJobs();
  } catch (err) {
    console.warn('[CRON_BATCH_WARN]', {
      phase: 'reap',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 2 — claim one job.
  let job;
  try {
    job = await claimNextQueuedJob();
  } catch (err) {
    console.error('[CRON_BATCH_ERROR]', {
      phase: 'claim',
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, reaped, error: 'claim failed' },
      { status: 500 },
    );
  }

  if (!job) {
    return NextResponse.json({ ok: true, reaped, ran: null });
  }

  // Step 3 — run it. runBatchJob handles its own success/failure
  // bookkeeping (markJobCompleted / markJobFailed inside).
  try {
    await runBatchJob(job);
  } catch (err) {
    // Defensive — runBatchJob is supposed to catch internally.
    console.error('[CRON_BATCH_ERROR]', {
      phase: 'run',
      jobId: job.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    reaped,
    ran: {
      job_id: job.id,
      batch_id: job.batch_id,
      tier: job.tier,
      website: job.website,
    },
  });
}
