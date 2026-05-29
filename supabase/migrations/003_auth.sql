-- =============================================================================
-- Migration 003: Auth Integration — user_id column, RLS rewrite, unique index
-- =============================================================================
--
-- Adds user_id FK to auth.users, creates a unique partial index, rewrites
-- all RLS policies on participantes from JWT wallet_address claims to auth.uid().
--
-- Rollout order: Must run BEFORE middleware (003_auth) because old RLS
-- policies reference JWT claims that email auth doesn't provide.
--
-- Rollback:
--   DROP POLICY IF EXISTS participantes_update_own ON participantes;
--   DROP POLICY IF EXISTS participantes_insert_own ON participantes;
--   DROP POLICY IF EXISTS participantes_select_authenticated ON participantes;
--   ALTER TABLE participantes DROP COLUMN user_id;
--   DROP INDEX IF EXISTS idx_participantes_user_id;
--   -- Re-create old policies from 001_schema.sql:
--   -- CREATE POLICY "participantes_select_authenticated" ON participantes FOR SELECT TO authenticated USING (true);
--   -- CREATE POLICY "participantes_insert_own" ON participantes FOR INSERT TO authenticated WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
--   -- CREATE POLICY "participantes_update_own" ON participantes FOR UPDATE TO authenticated USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address') WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');
-- =============================================================================

-- 1. Add user_id column (nullable for legacy rows, FK to auth.users)
ALTER TABLE participantes
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create a unique partial index: only non-NULL user_id values must be unique
--    This allows NULL for legacy rows that don't have an auth.users mapping
--    while preventing duplicate auth accounts being linked to multiple rows.
CREATE UNIQUE INDEX idx_participantes_user_id
  ON participantes (user_id)
  WHERE user_id IS NOT NULL;

-- =============================================================================
-- RLS Rewrite: From wallet_address JWT claims → auth.uid()
-- =============================================================================
--
-- Old policies used:
--   current_setting('request.jwt.claims', true)::json->>'wallet_address'
-- which only works when the JWT contains a wallet_address claim.
-- Email/password auth doesn't include wallet_address, so those policies
-- would reject all requests from email-authenticated users.
--
-- New policies use auth.uid() which works for ALL auth methods.

-- Drop old policies (idempotent — IF EXISTS)
DROP POLICY IF EXISTS "participantes_select_authenticated" ON participantes;
DROP POLICY IF EXISTS "participantes_insert_own" ON participantes;
DROP POLICY IF EXISTS "participantes_update_own" ON participantes;

-- SELECT: users see their own row; admins see all
-- (Authenticated users need to look up others for aval assignments, etc.)
CREATE POLICY "participantes_select_authenticated"
  ON participantes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR rol = 'admin');

-- INSERT: user can only insert their own row
--   WITH CHECK ensures the inserted user_id matches their auth.uid()
CREATE POLICY "participantes_insert_own"
  ON participantes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: user can only update their own row
--   USING prevents reading someone else's row
--   WITH CHECK prevents changing user_id to another user
CREATE POLICY "participantes_update_own"
  ON participantes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Backfill Note
-- =============================================================================
--
-- Existing participantes rows have wallet_address but no user_id.
-- The unique partial index allows NULL user_id for these legacy rows.
--
-- To backfill, you need a mapping from wallet_address to auth.users.id.
-- This requires an external mapping since wallet_address was previously
-- stored in the JWT custom claim, not in auth.users metadata.
--
-- If no backfill is possible, existing rows retain user_id = NULL and
-- authenticated users create NEW rows linked to their auth.uid().
