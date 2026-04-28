// ============================================================
// Discovery job lifecycle helpers.
//
// Each job represents one chained run of:
//   discovery (~60s) → report generation (~30s) → done
//
// API routes own creating + updating jobs. The runner doesn't
// know about jobs (keeps it decoupled — runner can still be
// called directly).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type JobStatus = 'pending' | 'running' | 'complete' | 'failed';
export type JobPhase = 'discovery' | 'report' | null;
export type JobTrigger = 'auto_first_run' | 'manual_rerun' | 'cron_monthly';

export interface DiscoveryJob {
  id: string;
  site_id: string;
  user_id: string | null;
  status: JobStatus;
  phase: JobPhase;
  progress_message: string | null;
  trigger_source: JobTrigger;
  run_id: string | null;
  report_generated_at: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function createJob(
  admin: SupabaseClient,
  params: { siteId: string; userId: string | null; trigger: JobTrigger },
): Promise<DiscoveryJob> {
  const { data, error } = await admin
    .from('discovery_jobs')
    .insert({
      site_id: params.siteId,
      user_id: params.userId,
      trigger_source: params.trigger,
      status: 'pending',
      progress_message: 'Job queued, starting…',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create job: ${error.message}`);
  return data as DiscoveryJob;
}

export async function updateJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Partial<DiscoveryJob>,
): Promise<void> {
  const { error } = await admin.from('discovery_jobs').update(patch).eq('id', jobId);
  if (error) {
    // Don't throw — job-state update failures shouldn't kill the actual work.
    // The user might see a stuck "Running…" but the report will still get
    // cached on the snapshot.
    console.error(`[discoveryJobs] Failed to update job ${jobId}:`, error.message);
  }
}

export async function findActiveJobForSite(
  admin: SupabaseClient,
  siteId: string,
): Promise<DiscoveryJob | null> {
  const { data } = await admin
    .from('discovery_jobs')
    .select('*')
    .eq('site_id', siteId)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DiscoveryJob) || null;
}

/**
 * Mark stale jobs as failed. Run from cron or anywhere we want to
 * defensively clean up. A job is stale if it's been "running" for
 * more than 10 minutes — discovery+report should never take that long.
 *
 * 1.5b's cron will call this before queueing new monthly runs.
 */
export async function reapStaleJobs(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('discovery_jobs')
    .update({
      status: 'failed',
      error: 'Job timed out (>10 min without completion)',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id');
  return data?.length || 0;
}
