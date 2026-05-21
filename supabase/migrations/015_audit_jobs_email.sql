-- ============================================================
-- Migration 015: contact email on audit_jobs
--
-- Adds an optional `email` column to audit_jobs so the batch
-- upload UI can carry a per-business contact address through
-- the pipeline and into the export CSV. Used by the cold-outreach
-- workflow: operator pastes the export into Instantly/Smartlead/
-- etc. and the email column is the recipient field.
--
-- Nullable on purpose — manual scans and pre-existing batches
-- have no email; an empty cell is the correct representation.
-- ============================================================

ALTER TABLE audit_jobs
  ADD COLUMN IF NOT EXISTS email TEXT;
