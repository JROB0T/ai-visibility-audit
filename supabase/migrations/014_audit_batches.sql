-- ============================================================
-- Migration 014: batch processing for prospecting / outreach
--
-- audit_batches  one row per /api/audits/batch submission
-- audit_jobs     one row per business inside the batch — the work
--                queue picked up by /api/cron/run-batch-jobs
--
-- Why a dedicated `audit_jobs` table separate from `discovery_jobs`
-- (migration 005): different semantics. `discovery_jobs` tracks the
-- progress of a scan against an EXISTING site (started by the
-- user from the dashboard). `audit_jobs` is a PENDING queue of
-- audits to *create* — neither the site nor the audit exists yet
-- at insert time.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional outbound webhook fired after each job completes.
  -- Phase 8 stubs this — accepted at creation, logged but not
  -- delivered. Wire real HTTP-out when there's a known consumer.
  notify_webhook TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_batches_created_by_idx
  ON audit_batches (created_by);

CREATE TABLE IF NOT EXISTS audit_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES audit_batches(id) ON DELETE CASCADE,
  -- Inputs captured from the submitting request. Stored on the job
  -- (not just the eventual sites/audits rows) so the batch status
  -- endpoint can render even before processing starts.
  business_name TEXT,
  website TEXT NOT NULL,
  location TEXT,
  industry TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tier_1', 'tier_2')),
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  audit_id UUID REFERENCES audits(id),
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_jobs_batch_id_idx
  ON audit_jobs (batch_id);
-- Hot-path: cron worker picks `queued` jobs ordered by created_at.
-- Partial index keeps the scan tiny once most jobs are completed.
CREATE INDEX IF NOT EXISTS audit_jobs_pending_idx
  ON audit_jobs (created_at)
  WHERE status IN ('queued', 'processing');

ALTER TABLE audit_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_jobs ENABLE ROW LEVEL SECURITY;

-- Owners can read their batches + the jobs inside them.
CREATE POLICY audit_batches_select_own ON audit_batches
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY audit_jobs_select_via_batch ON audit_jobs
  FOR SELECT USING (
    batch_id IN (SELECT id FROM audit_batches WHERE created_by = auth.uid())
  );

-- All writes go through the service-role API routes.
