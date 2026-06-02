-- =============================================================================
-- Remove 'prestamista', 'aval', and 'prestatario' from rol_participante enum
-- =============================================================================
--
-- The app now uses only two roles: 'usuario' (base) and 'admin'.
-- Existing rows with 'prestamista', 'aval', or 'prestatario' are migrated to 'usuario'.
--
-- Postgres does not support DROP VALUE from an enum, so we recreate it.
-- The migration of old values happens during ALTER COLUMN via CASE expression,
-- because 'usuario' doesn't exist in the old enum yet.
-- RLS policies that depend on the enum type must be dropped first and
-- recreated after the type change.
-- =============================================================================

BEGIN;

  -- 1. Drop policies that depend on the old type (they reference rol column)
  DROP POLICY IF EXISTS "participantes_select_authenticated" ON participantes;
  DROP POLICY IF EXISTS "participantes_insert_own" ON participantes;
  DROP POLICY IF EXISTS "participantes_update_own" ON participantes;
  DROP POLICY IF EXISTS "audit_log_select_admin_only" ON audit_log;

  -- 2. Recreate the enum with only active roles
  ALTER TYPE rol_participante RENAME TO rol_participante_old;

  CREATE TYPE rol_participante AS ENUM ('usuario', 'admin');

  -- 3. Alter column type, migrating old role values to 'usuario'
  ALTER TABLE participantes
    ALTER COLUMN rol TYPE rol_participante
    USING (
      CASE rol::text
        WHEN 'prestamista' THEN 'usuario'::rol_participante
        WHEN 'aval'       THEN 'usuario'::rol_participante
        WHEN 'prestatario' THEN 'usuario'::rol_participante
        ELSE rol::text::rol_participante
      END
    );

  DROP TYPE rol_participante_old;

  -- 4. Recreate policies
  CREATE POLICY "participantes_select_authenticated"
    ON participantes FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR rol = 'admin');

  CREATE POLICY "participantes_insert_own"
    ON participantes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "participantes_update_own"
    ON participantes FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "audit_log_select_admin_only"
    ON audit_log FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM participantes
        WHERE user_id = auth.uid() AND rol = 'admin'
      )
    );

COMMIT;
