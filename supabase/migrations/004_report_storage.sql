-- ============================================================
-- Migration 004: Report storage
--
-- Caches the generated report HTML + the structured narrative on the
-- score snapshot that produced it. Keyed by run_id (already the natural
-- key on discovery_score_snapshots), so reports are idempotent: second
-- GET for the same runId returns the cached HTML instead of re-calling
-- Claude.
--
-- We store narrative separately from HTML so we can re-stamp the template
-- (e.g. fix a CSS bug) without re-running narrative generation.
-- ============================================================

ALTER TABLE discovery_score_snapshots
  ADD COLUMN IF NOT EXISTS report_html text,
  ADD COLUMN IF NOT EXISTS report_narrative jsonb,
  ADD COLUMN IF NOT EXISTS report_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_model text;

-- Index so "show me all runs that have a generated report" is fast.
-- Most snapshots will have NULL here; partial index keeps it tight.
CREATE INDEX IF NOT EXISTS idx_discovery_score_snapshots_has_report
  ON discovery_score_snapshots(site_id, snapshot_date DESC)
  WHERE report_html IS NOT NULL;
