-- ============================================================
-- Migration 006: fix_list_items
--
-- Tracks per-item status (open / done / skipped) for fix list rows
-- on a given audit. Status is per (audit, source, source_id) so the
-- same recommendation can be marked done on one audit but still open
-- on a re-scan that recreated it.
--
-- Source-and-id approach (rather than a foreign key into
-- audit_recommendations or discovery_recommendations) lets the table
-- track both kinds of items uniformly without dual nullable FKs.
-- ============================================================

CREATE TABLE IF NOT EXISTS fix_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('audit', 'discovery')),
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'skipped')),
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (audit_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_fix_list_items_audit
  ON fix_list_items(audit_id);

ALTER TABLE fix_list_items ENABLE ROW LEVEL SECURITY;

-- Owners of the audit can read and update their fix list items
CREATE POLICY "users_read_own_fix_list" ON fix_list_items
  FOR SELECT
  USING (
    audit_id IN (
      SELECT a.id FROM audits a
      JOIN sites s ON s.id = a.site_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "users_update_own_fix_list" ON fix_list_items
  FOR UPDATE
  USING (
    audit_id IN (
      SELECT a.id FROM audits a
      JOIN sites s ON s.id = a.site_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "users_insert_own_fix_list" ON fix_list_items
  FOR INSERT
  WITH CHECK (
    audit_id IN (
      SELECT a.id FROM audits a
      JOIN sites s ON s.id = a.site_id
      WHERE s.user_id = auth.uid()
    )
  );

-- Service role bypasses RLS as expected (no policy needed for that path).
