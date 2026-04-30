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
//
// DIAGNOSTIC PATCH (temporary):
//   - Outer try/catch on POST returns the actual error message to
//     the client (with [DEBUG] prefix). REVERT once root cause is
//     identified — see docs/diagnostic-cleanup notes.
//   - Every catch logs '[RUN_AND_REPORT_ERROR]' with structured
//     fields. KEEP these — operational hygiene.
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
  // Captured early for error logging in the top-level catch.
  let bodyForLog: unknown = null;
  let userIdForLog: string | null = null;

  try {
    let body: RunAndReportRequest;
    try {
      body = await request.json();
      bodyForLog = body;
    } catch (err) {
      console.error('[RUN_AND_REPORT_ERROR]', {
        phase: 'parse_body',
        errorName: err instanceof Error ? err.name : 'UnknownError',
        errorMessage: err instanceof Error ? err.message : String(err),
        url: request.url,
      });
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
    userIdForLog = auth.userId;

    const admin = getAdminClient();

    // Self-heal: any "running" jobs older than 10 minutes get marked failed
    // before we check for an active job. Keeps the system from getting wedged.
    try {
      await reapStaleJobs(admin);
    } catch (err) {
      console.error('[RUN_AND_REPORT_ERROR]', {
        phase: 'reap_stale_jobs',
        errorName: err instanceof Error ? err.name : 'UnknownError',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
        siteId: body.siteId,
      });
      // Non-fatal — continue.
    }

    // Two cases for active jobs:
    //   - A *running* job means work is already in flight. Return it as
    //     alreadyRunning so the caller can join its polling.
    //   - A *pending* job (status='pending') means a webhook (or another
    //     entry point) recorded intent but no work has started yet.
    //     Pick it up: use its id, then proceed to kick off the run.
    //     Without this pickup, the Stripe rescan flow would create the
    //     pending job in the webhook and a SECOND job in the success-page
    //     call here — only the second would run; the first would orphan.
    const existing = await findActiveJobForSite(admin, body.siteId);
    if (existing && existing.status === 'running') {
      return NextResponse.json({ jobId: existing.id, alreadyRunning: true });
    }

    const job =
      existing ??
      (await createJob(admin, {
        siteId: body.siteId,
        userId: auth.userId,
        trigger: body.trigger || 'auto_first_run',
      }));

    // Fire-and-forget. The function-runtime keeps this promise alive until
    // it resolves (or maxDuration expires). Top-level catch marks the job
    // failed if the chain blows up before its own try/catch handlers.
    doRunAndReport({
      admin,
      jobId: job.id,
      siteId: body.siteId,
      appOrigin: request.nextUrl.origin,
    }).catch((err) => {
      console.error('[RUN_AND_REPORT_ERROR]', {
        phase: 'fire_and_forget_unhandled',
        errorName: err instanceof Error ? err.name : 'UnknownError',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
        jobId: job.id,
        siteId: body.siteId,
      });
      void updateJob(admin, job.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
      });
    });

    return NextResponse.json({ jobId: job.id, alreadyRunning: false });
  } catch (err) {
    // Top-level catch — surface unexpected exceptions properly.
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    const errorName = err instanceof Error ? err.name : 'UnknownError';

    console.error('[RUN_AND_REPORT_ERROR]', {
      phase: 'top_level_handler',
      errorName,
      errorMessage,
      errorStack,
      bodyForLog,
      userIdForLog,
      url: request.url,
      timestamp: new Date().toISOString(),
    });

    // TEMPORARY: return the actual error message so the UI surfaces it.
    // Revert this branch to a generic message once the bug is identified.
    return NextResponse.json(
      {
        error: `[DEBUG] ${errorName}: ${errorMessage}`,
        _debug: true,
      },
      { status: 500 },
    );
  }
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
      console.error('[RUN_AND_REPORT_ERROR]', {
        phase: 'post_run_hook',
        errorName: hookErr instanceof Error ? hookErr.name : 'UnknownError',
        errorMessage: hookErr instanceof Error ? hookErr.message : String(hookErr),
        errorStack: hookErr instanceof Error ? hookErr.stack : undefined,
        jobId,
        siteId,
        runId,
      });
      // Don't fail the whole job — insights/recs are nice-to-have.
    }
  } catch (err) {
    console.error('[RUN_AND_REPORT_ERROR]', {
      phase: 'discovery_runner',
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      jobId,
      siteId,
    });
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
    console.error('[RUN_AND_REPORT_ERROR]', {
      phase: 'report_generation',
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      jobId,
      siteId,
      runId,
    });
    await updateJob(admin, jobId, {
      status: 'failed',
      phase: 'report',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    });
  }
}
