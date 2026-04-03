-- ============================================================
-- 001_monetization.sql
-- Adds monetization, entitlements, and billing infrastructure
-- ============================================================

-- ============================================================
-- ALTER TABLE sites
-- ============================================================
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS vertical TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS has_monthly_monitoring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_scope TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_scheduled_scan_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_auto_rerun_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

-- Constrain vertical values
ALTER TABLE sites
  ADD CONSTRAINT sites_vertical_check
  CHECK (vertical IS NULL OR vertical IN ('saas', 'professional_services', 'local_service', 'ecommerce', 'healthcare', 'law_firm', 'other'));

-- Constrain plan_status values
ALTER TABLE sites
  ADD CONSTRAINT sites_plan_status_check
  CHECK (plan_status IN ('free', 'core', 'core_premium'));

-- Constrain monthly_scope values
ALTER TABLE sites
  ADD CONSTRAINT sites_monthly_scope_check
  CHECK (monthly_scope IS NULL OR monthly_scope IN ('core', 'core_premium'));

-- ============================================================
-- ALTER TABLE audits
-- ============================================================
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS run_type TEXT DEFAULT 'paid_initial',
  ADD COLUMN IF NOT EXISTS run_scope TEXT DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS previous_audit_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bot_activity JSONB DEFAULT NULL;

-- Constrain run_type values
ALTER TABLE audits
  ADD CONSTRAINT audits_run_type_check
  CHECK (run_type IN ('free_preview', 'paid_initial', 'manual_paid_rescan', 'monthly_auto_rerun'));

-- Constrain run_scope values
ALTER TABLE audits
  ADD CONSTRAINT audits_run_scope_check
  CHECK (run_scope IN ('free', 'core', 'core_plus_premium'));

-- FK for delta tracking
ALTER TABLE audits
  ADD CONSTRAINT audits_previous_audit_fk
  FOREIGN KEY (previous_audit_id) REFERENCES audits(id);

-- ============================================================
-- CREATE TABLE entitlements
-- ============================================================
CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  can_view_core BOOLEAN DEFAULT false,
  can_view_growth_strategy BOOLEAN DEFAULT false,
  can_view_marketing_perception BOOLEAN DEFAULT false,
  can_export BOOLEAN DEFAULT false,
  has_monthly_monitoring BOOLEAN DEFAULT false,
  monthly_scope TEXT DEFAULT NULL,
  stripe_customer_id TEXT DEFAULT NULL,
  stripe_subscription_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, site_id)
);

-- Constrain monthly_scope on entitlements
ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_monthly_scope_check
  CHECK (monthly_scope IS NULL OR monthly_scope IN ('core', 'core_premium'));

-- ============================================================
-- CREATE TABLE billing_events
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  site_id UUID REFERENCES sites(id),
  audit_id UUID REFERENCES audits(id),
  event_type TEXT NOT NULL,
  stripe_session_id TEXT,
  stripe_invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Constrain event_type values
ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN ('initial_scan', 'premium_addon', 'bundle', 'manual_rescan', 'monthly_subscription', 'monthly_renewal'));

-- ============================================================
-- RLS policies
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Entitlements: users can SELECT their own rows
CREATE POLICY entitlements_select_own ON entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- Entitlements: users can UPDATE their own rows
CREATE POLICY entitlements_update_own ON entitlements
  FOR UPDATE USING (auth.uid() = user_id);

-- Billing events: users can SELECT their own rows
CREATE POLICY billing_events_select_own ON billing_events
  FOR SELECT USING (auth.uid() = user_id);

-- Sites: allow updates to new columns (extend existing policy if needed)
-- This policy allows authenticated users to update their own sites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sites' AND policyname = 'sites_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY sites_update_own ON sites FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Audits: allow updates to new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audits' AND policyname = 'audits_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY audits_update_own ON audits FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_site_id ON entitlements(site_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_site_id ON billing_events(site_id);
CREATE INDEX IF NOT EXISTS idx_sites_stripe_customer_id ON sites(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_audits_previous_audit_id ON audits(previous_audit_id);
CREATE INDEX IF NOT EXISTS idx_sites_next_scheduled_scan ON sites(next_scheduled_scan_at)
  WHERE next_scheduled_scan_at IS NOT NULL;
