-- =============================================================================
-- Migration 026: Add municipio column to grupos_gacc
-- =============================================================================
--
-- Adds the municipio (municipality/city) field to GACC groups so the
-- application can filter and display which municipality each GACC operates in.
--
-- Valid values: 'guapi', 'timbiqui' (matching the Zod validation schema).
--
-- Rollback:
--   ALTER TABLE grupos_gacc DROP COLUMN IF EXISTS municipio;
-- =============================================================================

ALTER TABLE grupos_gacc
  ADD COLUMN municipio text;

COMMENT ON COLUMN grupos_gacc.municipio IS
  'Municipio donde opera el GACC (guapi, timbiqui, etc.)';
