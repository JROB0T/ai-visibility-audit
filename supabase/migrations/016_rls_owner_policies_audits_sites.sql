-- ============================================================
-- Migration 016: Owner-scoped RLS policies for audits + sites
--
-- STATUS: DRAFT — DO NOT auto-apply. Review, then run by hand in
-- the Supabase SQL Editor (the operator's standard migration flow).
--
-- Purpose
--   Add owner-scoped Row Level Security so a logged-in user can only
--   SELECT/UPDATE/DELETE their own `audits` and `sites` rows
--   (auth.uid() = user_id). This is additive and idempotent
--   (DROP POLICY IF EXISTS before each CREATE) so it is safe to
--   re-run.
--
-- IMPORTANT — these policies are INERT until the permissive policies
-- are removed. See the "STEP 2" section at the bottom.
--   Postgres combines PERMISSIVE policies with OR. If a pre-existing
--   "Anyone can SELECT/UPDATE/INSERT" policy with USING (true) still
--   exists on the same table+command, it OR-overrides everything here
--   and the table stays wide open. The owner policies below only take
--   effect once those permissive policies are dropped. The DROP
--   statements are intentionally left commented out because (a) they
--   are destructive and (b) the exact policy names must be confirmed
--   against your database first (see the inventory query in STEP 2).
--
-- Unclaimed-row pattern (read before deploying)
--   Free scans and batch jobs create `audits`/`sites` rows with
--   user_id = NULL, which a logged-in user later "claims"
--   (NULL -> their uid). That claim write is performed by the
--   service-role client (see src/app/api/audit/[id]/route.ts), which
--   BYPASSES RLS entirely — so the owner-scoped UPDATE policy below
--   does NOT need a NULL carve-out and will not block legitimate
--   claiming. Normal row creation also happens via the service-role
--   client server-side, so no authenticated INSERT policy is required
--   for the app to function; a conservative owner-only INSERT policy
--   is included for defense-in-depth.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1 (additive, safe to apply): enable RLS + owner policies
-- ------------------------------------------------------------

-- Enable RLS (no-op if already enabled).
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites  ENABLE ROW LEVEL SECURITY;

-- ---- audits ----
DROP POLICY IF EXISTS "Owners can select their audits" ON audits;
CREATE POLICY "Owners can select their audits"
  ON audits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can update their audits" ON audits;
CREATE POLICY "Owners can update their audits"
  ON audits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete their audits" ON audits;
CREATE POLICY "Owners can delete their audits"
  ON audits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can insert their audits" ON audits;
CREATE POLICY "Owners can insert their audits"
  ON audits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---- sites ----
DROP POLICY IF EXISTS "Owners can select their sites" ON sites;
CREATE POLICY "Owners can select their sites"
  ON sites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can update their sites" ON sites;
CREATE POLICY "Owners can update their sites"
  ON sites FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete their sites" ON sites;
CREATE POLICY "Owners can delete their sites"
  ON sites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can insert their sites" ON sites;
CREATE POLICY "Owners can insert their sites"
  ON sites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- STEP 2 (REQUIRED to actually close the hole — review first):
-- remove the permissive "Anyone can ..." policies.
--
-- Until you run these, STEP 1's policies are inert (see header).
-- First inventory the real policy names on your database:
--
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('audits','sites')
--   ORDER BY tablename, cmd;
--
-- Then, for each permissive USING(true) policy you find, drop it.
-- Replace the example names below with the ACTUAL names from the
-- query above before running:
--
--   DROP POLICY IF EXISTS "Anyone can select audits"  ON audits;
--   DROP POLICY IF EXISTS "Anyone can update audits"  ON audits;
--   DROP POLICY IF EXISTS "Anyone can insert audits"  ON audits;
--   DROP POLICY IF EXISTS "Anyone can select sites"   ON sites;
--   DROP POLICY IF EXISTS "Anyone can update sites"   ON sites;
--   DROP POLICY IF EXISTS "Anyone can insert sites"   ON sites;
--
-- After dropping, re-run the inventory query and confirm only the
-- owner-scoped policies remain. Smoke-test: a logged-in user can still
-- load their own report; a free-scan + claim still works (service role
-- path); an unauthenticated PostgREST call can no longer read/write.
-- ------------------------------------------------------------
