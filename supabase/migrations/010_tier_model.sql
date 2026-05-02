-- ============================================================
-- Migration 010: tier model
--
-- Introduces the three-tier product model (free / tier_1 / tier_2)
-- on audits + score snapshots, plus two new tables:
--   * free_scan_requests — tracks public free-scan submissions
--     with one-per-email and one-per-domain uniqueness on the
--     PUBLIC path only (admin retriggers bypass the unique index
--     via a partial-index predicate on triggered_by).
--   * subscriptions — paid monthly cadence state for tier_1 / tier_2.
--
-- Per the operator: there are no existing paying customers, so
-- backfilling existing audits to tier_1 is acceptable.
-- ============================================================

-- ============================================================
-- audits.tier
-- ============================================================
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'tier_1';

ALTER TABLE audits
  DROP CONSTRAINT IF EXISTS audits_tier_check;
ALTER TABLE audits
  ADD CONSTRAINT audits_tier_check
  CHECK (tier IN ('free', 'tier_1', 'tier_2'));

-- ============================================================
-- discovery_score_snapshots.tier
--
-- Renderer reads tier off the snapshot row to decide what to show.
-- Default is tier_1 to match the audits backfill.
-- ============================================================
ALTER TABLE discovery_score_snapshots
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'tier_1';

ALTER TABLE discovery_score_snapshots
  DROP CONSTRAINT IF EXISTS discovery_score_snapshots_tier_check;
ALTER TABLE discovery_score_snapshots
  ADD CONSTRAINT discovery_score_snapshots_tier_check
  CHECK (tier IN ('free', 'tier_1', 'tier_2'));

-- ============================================================
-- free_scan_requests
--
-- One row per free-scan submission. Public path enforces "one per
-- email ever, one per domain ever" via partial unique indexes
-- (predicate triggered_by = 'public'). Admin retriggers go in with
-- triggered_by = 'admin' and bypass the unique constraint.
-- ============================================================
CREATE TABLE IF NOT EXISTS free_scan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  domain TEXT NOT NULL,
  domain_normalized TEXT NOT NULL,
  audit_id UUID REFERENCES audits(id),
  ip_address INET,
  user_agent TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'public'
    CHECK (triggered_by IN ('public', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

-- Partial unique indexes — enforced only on public submissions.
CREATE UNIQUE INDEX IF NOT EXISTS free_scan_one_per_email_public
  ON free_scan_requests (email_normalized)
  WHERE triggered_by = 'public';
CREATE UNIQUE INDEX IF NOT EXISTS free_scan_one_per_domain_public
  ON free_scan_requests (domain_normalized)
  WHERE triggered_by = 'public';
CREATE INDEX IF NOT EXISTS free_scan_requests_created_at_idx
  ON free_scan_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS free_scan_requests_audit_id_idx
  ON free_scan_requests (audit_id)
  WHERE audit_id IS NOT NULL;

-- RLS: deny-by-default. Server code uses the service-role client,
-- which bypasses RLS. No anon policies — free-scan creation goes
-- through the API route, not direct PostgREST.
ALTER TABLE free_scan_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- subscriptions
--
-- Monthly cadence state for tier_1 / tier_2. One row per active
-- Stripe subscription. cron/run-due-subscriptions polls
-- next_run_at to fire monthly reruns.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  domain TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('tier_1', 'tier_2')),
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly')),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'paused')),
  next_run_at TIMESTAMPTZ,
  last_run_audit_id UUID REFERENCES audits(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_next_run_at_idx
  ON subscriptions (next_run_at)
  WHERE status = 'active';

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Owners can read their own subscriptions.
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Writes only via service-role from the webhook + cron.
