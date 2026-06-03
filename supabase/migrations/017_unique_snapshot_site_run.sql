-- ============================================================
-- Migration 017: unique (site_id, run_id) on discovery_score_snapshots
--
-- WHY
--   There is no unique constraint on (site_id, run_id). Duplicate rows
--   for the same scan run are the root cause behind:
--     * the earlier "report regenerates on every load" cache bug, and
--     * the share/PDF "regenerate doesn't propagate" bug (a force-
--       regenerate UPDATE with a singular accept header 406s + rolls
--       back when >1 row matches, so report_html never persists for the
--       share_token row).
--   Adding a UNIQUE index removes the ambiguity at the source.
--
-- SAFETY / HOW TO APPLY (owner runs this by hand in the Supabase SQL
-- editor — it is NOT auto-applied):
--   1. Run STEP 1 (preview) ALONE first and read the output. It is a
--      pure SELECT — it changes nothing. If it returns 0 rows, there are
--      no duplicates and you can skip straight to STEP 3.
--   2. Only if STEP 1 shows duplicates, run STEP 2 (dedupe). This is the
--      one DESTRUCTIVE statement in this file: it DELETES the redundant
--      duplicate rows, keeping exactly one row per (site_id, run_id).
--      The "keep" choice is share-link-safe (see ordering below).
--   3. Run STEP 3 (create the unique index). Idempotent — safe to re-run.
--
-- The dedupe "keep" ordering, per (site_id, run_id) group, keeps the row
-- that is:
--   a) sharing-enabled (share_token IS NOT NULL) first  -> never break a
--      live public /r/{token} link,
--   b) then the most recently generated report (report_generated_at),
--   c) then the newest snapshot_date,
--   d) then the highest id  (final deterministic tiebreak).
--
-- NOTE on NULL run_id: Postgres treats NULLs as distinct in a unique
-- index, so rows with run_id IS NULL never collide and are intentionally
-- left untouched by both the dedupe and the index.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only). Run this alone first.
-- Lists every (site_id, run_id) that has more than one row, and which
-- single row would be KEPT vs DELETED by STEP 2. Changes nothing.
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    site_id,
    run_id,
    snapshot_date,
    report_generated_at,
    share_token,
    ROW_NUMBER() OVER (
      PARTITION BY site_id, run_id
      ORDER BY
        (share_token IS NOT NULL) DESC,
        report_generated_at DESC NULLS LAST,
        snapshot_date DESC NULLS LAST,
        id DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY site_id, run_id) AS group_size
  FROM discovery_score_snapshots
  WHERE run_id IS NOT NULL
)
SELECT
  site_id,
  run_id,
  id,
  snapshot_date,
  report_generated_at,
  (share_token IS NOT NULL) AS is_shared,
  CASE WHEN rn = 1 THEN 'KEEP' ELSE 'DELETE' END AS action
FROM ranked
WHERE group_size > 1
ORDER BY site_id, run_id, rn;


-- ------------------------------------------------------------
-- STEP 2 — DEDUPE (DESTRUCTIVE). Run ONLY if STEP 1 showed duplicates.
-- Deletes the redundant rows, keeping one row per (site_id, run_id)
-- using the same ordering previewed above.
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY site_id, run_id
      ORDER BY
        (share_token IS NOT NULL) DESC,
        report_generated_at DESC NULLS LAST,
        snapshot_date DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM discovery_score_snapshots
  WHERE run_id IS NOT NULL
)
DELETE FROM discovery_score_snapshots s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;


-- ------------------------------------------------------------
-- STEP 3 — UNIQUE INDEX (idempotent). Run after the dedupe.
-- Enforces one snapshot row per (site_id, run_id) going forward.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_snapshots_site_run
  ON discovery_score_snapshots (site_id, run_id)
  WHERE run_id IS NOT NULL;
