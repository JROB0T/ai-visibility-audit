// ============================================================
// /api/discovery/run-and-report
//
// Single endpoint that chains discovery + report generation as
// one job. Returns jobId immediately; client polls
// /api/discovery/job-status for progress.
//
// Why one endpoint instead of two sequential client calls:
//   - Atomicity: one failure mode, one rollback point
//   - Resilience: user can close their tab; the job continues
//   - Reuse: 1.5b's cron calls this same endpoint internally
//
// Why we don't return until done in the same request:
//   We DO return jobId immediately AND keep processing. Vercel
//   functions stay alive while pending promises exist (up to
//   maxDuration). The fire-and-forget Promise wrapping
//   doRunAndReport keeps the runtime in flight until the chain
//   finishes or maxDuration kicks in.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireDiscoveryAccess } from '@/lib/discoveryAccess';
import { runDiscoveryTests } from '@/lib/discoveryRunner';
import { runPostRunHook } from '../run-tests/route';
import { generateReportNarrative, type ReportExportPayload } from '@/lib/reportNarrative';
import { buildReportHtml } from '@/lib/reportTemplate';
import {
  createJob,
  updateJob,
  findActiveJobForSite,
  reapStaleJobs,
  type JobTrigger,
} from '@/lib/discoveryJobs';

export const maxDuration = 300;

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RunAndReportRequest {
  siteId: string;
  trigger?: JobTrigger;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RunAndReportRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const auth = await requireDiscoveryAccess(request, body.siteId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.isAdmin && !auth.isPaid) {
    return NextResponse.json({ error: 'Discovery requires a paid plan' }, { status: 403 });
  }

  const admin = getAdminClient();

  // Self-heal: any "running" jobs older than 10 minutes get marked failed
  // before we check for an active job. Keeps the system from getting wedged.
  try {
    await reapStaleJobs(admin);
  } catch (err) {
    console.error('[run-and-report] reapStaleJobs error (non-fatal):', err);
  }

  // Don't double-queue: if there's already an active job for this site, return it
  const existing = await findActiveJobForSite(admin, body.siteId);
  if (existing) {
    return NextResponse.json({ jobId: existing.id, alreadyRunning: true });
  }

  const job = await createJob(admin, {
    siteId: body.siteId,
    userId: auth.userId,
    trigger: body.trigger || 'auto_first_run',
  });

  // Fire-and-forget. The function-runtime keeps this promise alive until
  // it resolves (or maxDuration expires). Top-level catch marks the job
  // failed if the chain blows up before its own try/catch handlers.
  doRunAndReport({
    admin,
    jobId: job.id,
    siteId: body.siteId,
    appOrigin: request.nextUrl.origin,
  }).catch((err) => {
    console.error(`[run-and-report] Unhandled error in job ${job.id}:`, err);
    void updateJob(admin, job.id, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
  });

  return NextResponse.json({ jobId: job.id, alreadyRunning: false });
}

async function doRunAndReport(params: {
  admin: SupabaseClient;
  jobId: string;
  siteId: string;
  appOrigin: string;
}): Promise<void> {
  const { admin, jobId, siteId, appOrigin } = params;

  await updateJob(admin, jobId, {
    status: 'running',
    phase: 'discovery',
    progress_message: 'Testing buyer-intent prompts across AI tools…',
    started_at: new Date().toISOString(),
  });

  // ----- Phase A: Discovery -----
  let runId: string;
  try {
    const run = await runDiscoveryTests({
      siteId,
      tier: 'full',
      triggeredBy: 'user',
      onProgress: (done, total) => {
        // Best-effort. Don't await — runner shouldn't be slowed by progress writes.
        void updateJob(admin, jobId, {
          progress_message: `Testing buyer-intent prompts (${done}/${total})…`,
        });
      },
    });
    runId = run.runId;

    // Run the post-run hook (insights, recs, competitors). Same as run-tests.
    try {
      await runPostRunHook(siteId, runId, 'full', run.results);
    } catch (hookErr) {
      console.error(`[run-and-report] post-run hook error in job ${jobId}:`, hookErr);
      // Don't fail the whole job — insights/recs are nice-to-have.
    }
  } catch (err) {
    await updateJob(admin, jobId, {
      status: 'failed',
      phase: 'discovery',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
    return;
  }

  // ----- Phase B: Report -----
  await updateJob(admin, jobId, {
    phase: 'report',
    progress_message: 'Generating your AI Positioning Brief…',
    run_id: runId,
  });

  try {
    const exportRes = await fetch(
      `${appOrigin}/api/discovery/export-report?siteId=${encodeURIComponent(siteId)}&runId=${encodeURIComponent(runId)}`,
      {
        headers: { 'x-internal-job': jobId },
        cache: 'no-store',
      },
    );

    if (!exportRes.ok) {
      throw new Error(`export-report fetch failed: ${exportRes.status}`);
    }

    const payload = (await exportRes.json()) as ReportExportPayload;
    const { narrative, model } = await generateReportNarrative(payload);
    const html = buildReportHtml(payload, narrative);

    await admin
      .from('discovery_score_snapshots')
      .update({
        report_html: html,
        report_narrative: narrative,
        report_generated_at: new Date().toISOString(),
        report_model: model,
      })
      .eq('site_id', siteId)
      .eq('run_id', runId);

    await updateJob(admin, jobId, {
      status: 'complete',
      phase: null,
      progress_message: null,
      report_generated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await updateJob(admin, jobId, {
      status: 'failed',
      phase: 'report',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
  }
}
