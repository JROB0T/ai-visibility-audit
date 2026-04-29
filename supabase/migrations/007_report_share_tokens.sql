-- ============================================================
-- Migration 007: report share tokens
--
-- Adds share_token + shared_at columns to discovery_score_snapshots
-- so users can publish a report at an unlisted public URL.
--
-- share_token is NULL when the report is not shared.
-- When set, it's a short URL-safe random string serving as the
-- access token for /r/{token}.
--
-- shared_at records when the user last enabled sharing — useful
-- for "this report was shared on [date]" surfacing later. Not
-- displayed in v1 but cheap to record.
-- ============================================================

ALTER TABLE discovery_score_snapshots
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_share_token
  ON discovery_score_snapshots(share_token)
  WHERE share_token IS NOT NULL;

-- No RLS changes — share_token is intentionally accessible
-- by anyone holding the token. The public route reads it via
-- the service role.
