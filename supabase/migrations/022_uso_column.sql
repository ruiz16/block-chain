-- =============================================================================
-- Add `uso` column to creditos — purpose/category of the credit
-- =============================================================================
--
-- Previously `descripcion` was being used to store the category.
-- Now `uso` holds the structured category, `descripcion` is free text.
-- =============================================================================

ALTER TABLE creditos ADD COLUMN uso text NOT NULL DEFAULT '';

COMMENT ON COLUMN creditos.uso IS 'Propósito del crédito (insumos, herramientas, mercancía, etc.)';
