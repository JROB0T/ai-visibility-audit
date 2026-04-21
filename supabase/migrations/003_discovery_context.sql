-- ============================================================
-- Ticket 7.6 — business-context enrichment
--
-- Adds two nullable context columns to discovery_profiles so the
-- prompt generator can anchor local-intent prompts to a specific
-- city/region without having to reparse the free-form `service_area`.
--
-- Additive only. Safe to re-run (IF NOT EXISTS guards).
-- ============================================================

ALTER TABLE discovery_profiles
  ADD COLUMN IF NOT EXISTS service_area_city text;

ALTER TABLE discovery_profiles
  ADD COLUMN IF NOT EXISTS service_area_region text;

-- Optional: index is unnecessary since these are free-form display strings,
-- not queried as join/filter keys.
