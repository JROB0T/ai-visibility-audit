-- ============================================================
-- Migration 009: Rename billing_events.event_type 'manual_rescan'
-- to 'manual_paid_rescan' for vocabulary consistency with the
-- audits.run_type column.
--
-- Done as three steps in one migration:
--   A. Widen constraint to allow both old and new values
--   B. Backfill old rows to new vocabulary
--   C. Tighten constraint to exclude old value
--
-- This pattern avoids a window where existing rows would violate
-- a constraint mid-migration.
-- ============================================================

-- Step A: widen constraint
ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'initial_scan',
    'premium_addon',
    'bundle',
    'manual_rescan',         -- transitional, removed in Step C
    'manual_paid_rescan',    -- new canonical value
    'monthly_subscription',
    'monthly_renewal'
  ));

-- Step B: backfill
UPDATE billing_events
  SET event_type = 'manual_paid_rescan'
  WHERE event_type = 'manual_rescan';

-- Step C: tighten constraint (drop the transitional old value)
ALTER TABLE billing_events
  DROP CONSTRAINT billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'initial_scan',
    'premium_addon',
    'bundle',
    'manual_paid_rescan',
    'monthly_subscription',
    'monthly_renewal'
  ));
