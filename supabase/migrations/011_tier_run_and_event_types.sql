-- ============================================================
-- Migration 011: widen audits.run_type and billing_events.event_type
--
-- Adds:
--   * run_type 'free_sample' for the new free email-capture scans.
--     'free_preview' is preserved for compatibility with any historical
--     rows; can be dropped in a follow-up after a zero-row check.
--   * Four new event_type values for the tier_1 / tier_2 SKUs.
--
-- Prerequisite: migration 009 (manual_rescan -> manual_paid_rescan)
-- must be applied. This migration assumes the canonical value is
-- already 'manual_paid_rescan'.
-- ============================================================

-- ============================================================
-- audits.run_type
-- ============================================================
ALTER TABLE audits
  DROP CONSTRAINT IF EXISTS audits_run_type_check;

ALTER TABLE audits
  ADD CONSTRAINT audits_run_type_check
  CHECK (run_type IN (
    'free_preview',           -- legacy; preserved for historical rows
    'free_sample',            -- new: free email-capture scans
    'paid_initial',
    'manual_paid_rescan',
    'monthly_auto_rerun'
  ));

-- ============================================================
-- billing_events.event_type
-- ============================================================
ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'initial_scan',
    'premium_addon',
    'bundle',
    'manual_paid_rescan',
    'monthly_subscription',
    'monthly_renewal',
    'tier_1_one_time',
    'tier_1_monthly',
    'tier_2_one_time',
    'tier_2_monthly'
  ));
