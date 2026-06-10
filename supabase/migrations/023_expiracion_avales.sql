-- =============================================================================
-- Migration 023: Expiración de créditos + GACC obligatorio
-- =============================================================================
--
-- 1. Agrega estado 'expirado' al enum estado_credito
-- 2. Agrega columna expiracion_en a creditos
-- 3. Corrige UNIQUE de avales (reemplaza prestatario_id+credito_id por aval_id+credito_id)
-- =============================================================================

-- 1. Add 'expirado' to estado_credito enum
ALTER TYPE estado_credito ADD VALUE IF NOT EXISTS 'expirado';

-- 2. Add expiracion_en column (7 days after solicitud)
ALTER TABLE creditos ADD COLUMN expiracion_en timestamptz;

COMMENT ON COLUMN creditos.expiracion_en IS 'Fecha de expiración (7 días después de la solicitud). Si no tiene avales suficientes para esa fecha, se marca como expirado.';

-- 3. Fix unique constraint on avales
-- The old UNIQUE (prestatario_id, credito_id) prevented the same prestatario
-- from avaling the same credit twice, but it should be aval_id + credito_id
DROP INDEX IF EXISTS avales_prestatario_id_credito_id_key;
ALTER TABLE avales DROP CONSTRAINT IF EXISTS avales_prestatario_id_credito_id_key;
ALTER TABLE avales ADD UNIQUE (aval_id, credito_id);
