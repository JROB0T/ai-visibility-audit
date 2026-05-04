-- ============================================================
-- Migration 012: rate_limit_buckets
--
-- Generic key-bucketed counter for IP rate limiting on public endpoints.
-- Phase-3 use case is /api/free-scan/request (5/hour/IP), but the table
-- is intentionally generic — any future public endpoint can adopt it.
--
-- Race-safety note: src/lib/rateLimit.ts implements a read-then-update
-- pattern that is NOT atomic under concurrent writers. For 5-per-hour
-- limits at low volume that's fine. If we ever need stricter guarantees
-- (e.g. anti-abuse on a higher-traffic endpoint), wrap in a SECURITY
-- DEFINER RPC with row-level locking.
--
-- Rows accumulate. Periodic prune via a cron job is recommended:
--   DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 day';
-- Not enforced here.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_start_idx
  ON rate_limit_buckets (window_start);

-- Service-role only. No RLS policies needed because anon clients should
-- never touch this table directly — rate-limit checks always go through
-- the service-role helper in src/lib/rateLimit.ts.
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
