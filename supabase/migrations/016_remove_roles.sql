-- =============================================================================
-- Remove 'prestamista' and 'aval' from rol_participante enum
-- =============================================================================
--
-- These roles are no longer used in the application. Existing rows with
-- these values are migrated to 'prestatario'.
--
-- Postgres does not support DROP VALUE from an enum, so we recreate it.
-- =============================================================================

BEGIN;

  -- Migrate existing rows to prestatario before altering the type
  UPDATE participantes SET rol = 'prestatario' WHERE rol IN ('prestamista', 'aval');

  -- Recreate the enum without the removed values
  ALTER TYPE rol_participante RENAME TO rol_participante_old;

  CREATE TYPE rol_participante AS ENUM ('prestatario', 'admin');

  ALTER TABLE participantes
    ALTER COLUMN rol TYPE rol_participante
    USING rol::text::rol_participante;

  DROP TYPE rol_participante_old;

COMMIT;
