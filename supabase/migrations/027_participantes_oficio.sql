-- =============================================================================
-- Migration 027: Add oficio column to participantes
-- =============================================================================
--
-- Adds the oficio (occupation/trade) field to participants so the application
-- can track what each participant does for a living.
--
-- Rollback:
--   ALTER TABLE participantes DROP COLUMN IF EXISTS oficio;
-- =============================================================================

ALTER TABLE participantes
  ADD COLUMN oficio text;

COMMENT ON COLUMN participantes.oficio IS
  'Oficio u ocupación del participante (ej. agricultura, comercio, etc.)';
