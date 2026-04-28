-- ============================================================
-- Migration 005: discovery_jobs
--
-- Job state for chained discovery + report generation. Used by:
--   - Auto-first-run on paid landing (1.5a)
--   - Manual re-run after subscription (1.5b)
--   - Cron-triggered monthly re-runs (1.5b)
--
-- Lifecycle:
--   pending  → just inserted, no work started yet
--   running  → discovery in progress (or report gen in progress)
--   complete → both phases finished, report cached on snapshot
--   failed   → either phase errored; check `error` column
--
-- The job row owns the user-visible status ("Testing prompts… 12/20").
-- Updates to `phase` + `progress_message` happen as the job advances.
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  phase text,             -- 'discovery' | 'report' | null
  progress_message text,  -- user-facing copy: "Testing prompts (12/20)…"

  -- Trigger source — useful for analytics + cron debugging
  trigger_source text NOT NULL CHECK (trigger_source IN ('auto_first_run', 'manual_rerun', 'cron_monthly')),

  -- Outputs
  run_id uuid,            -- populated when discovery completes
  report_generated_at timestamptz,

  -- Failure
  error text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT NOW(),
  started_at timestamptz,
  completed_at timestamptz
);

-- One active job per site at a time. Two indexes:
-- (a) by site for "is there a job running for this site"
-- (b) by status+created_at for cron pickup ("pending or stale running jobs")
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_site_active
  ON discovery_jobs(site_id, created_at DESC)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status_created
  ON discovery_jobs(status, created_at)
  WHERE status IN ('pending', 'running');

-- RLS: users can only see jobs for sites they own.
ALTER TABLE discovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_site_jobs" ON discovery_jobs
  FOR SELECT
  USING (
    site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
  );

-- Service role bypasses RLS as expected; no INSERT/UPDATE policies needed
-- (all writes happen via the API routes using the service role key).
