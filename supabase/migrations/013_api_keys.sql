-- ============================================================
-- Migration 013: api_keys
--
-- Per-user API keys for programmatic access. Phase 8's batch
-- endpoints will gate on Bearer-token verification against this
-- table; Phase 7 already wires CSV/JSON export through it.
--
-- Storage model:
--   - key_hash      stores SHA-256(key) — never the raw key
--   - key_prefix    stores the first 8 chars of the raw key, for UI
--                   identification ("avak_live_a3f7…") without
--                   re-exposing the secret
--   - revoked_at    soft-delete column; lookups must filter on NULL
--
-- Why SHA-256 not bcrypt: API keys are 32-byte high-entropy
-- secrets. Bcrypt's work factor exists to slow down brute-forcing
-- low-entropy passwords; that work cost has no value here and would
-- add latency to every authenticated API request.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id);
-- key_hash is already unique-indexed by the UNIQUE constraint above,
-- but a partial index excluding revoked rows speeds up the hot-path
-- auth lookup (which always filters revoked_at IS NULL).
CREATE INDEX IF NOT EXISTS api_keys_active_lookup_idx
  ON api_keys (key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Owners can read their own keys (for the dashboard list).
CREATE POLICY api_keys_select_own ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Inserts / updates / deletes always go through the service-role
-- API routes — never directly from anon clients. No write policies
-- needed (RLS default-denies).
