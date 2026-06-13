-- =============================================================================
-- Migration 028: Fix enums — add missing values
-- =============================================================================
--
-- Adds missing values to the tipo_accion enum that are referenced in code
-- but were never added to the database enum:
--
--   1. 'interes_barrido'  — used by barrer-intereses.ts
--   2. 'score_actualizado' — used by score events (migration 011)
--
-- Both use DO $$ blocks with IF NOT EXISTS for idempotency.
--
-- Rollback:
--   Cannot remove enum values in Postgres without recreating the type.
--   If needed, recreate the tipo_accion type without these values and
--   migrate existing rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add 'interes_barrido' to tipo_accion enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'interes_barrido'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'interes_barrido';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add 'score_actualizado' to tipo_accion enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'score_actualizado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'score_actualizado';
  END IF;
END $$;
