-- =============================================================================
-- Migration 005: Admin Role — enum extension + audit_log RLS rewrite
-- =============================================================================
--
-- Adds 'admin' to rol_participante enum and restricts audit_log SELECT to
-- admin users only.
--
-- IMPORTANT: ALTER TYPE ADD VALUE CANNOT run inside a transaction block.
-- Supabase runs each migration file as a single transaction, so we use a
-- DO $$ block with pg_enum existence check as the workaround.
--
-- Rollback:
--   To remove 'admin' from the enum, you'd need to:
--   1. Ensure no rows reference 'admin'
--   2. ALTER TYPE rol_participante RENAME TO rol_participante_old;
--   3. CREATE TYPE rol_participante AS ENUM (...old values without 'admin'...);
--   4. ALTER TABLE participantes ALTER COLUMN rol TYPE rol_participante USING rol::text::rol_participante;
--   5. DROP TYPE rol_participante_old;
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin'
      AND enumtypid = 'rol_participante'::regtype
  ) THEN
    ALTER TYPE rol_participante ADD VALUE 'admin';
  END IF;
END $$;

-- =============================================================================
-- Audit Log RLS: Restrict SELECT to admin users only
-- =============================================================================
--
-- Previously: audit_log_select_authenticated allowed ALL authenticated users
-- to SELECT from audit_log (migration 001).
--
-- Now: Only users with rol = 'admin' in participantes can SELECT.
-- This uses EXISTS with a subquery on participantes, which is safe because
-- auth.uid() is always available for authenticated requests.
-- =============================================================================

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;

CREATE POLICY "audit_log_select_admin_only"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participantes
      WHERE user_id = auth.uid() AND rol = 'admin'
    )
  );
