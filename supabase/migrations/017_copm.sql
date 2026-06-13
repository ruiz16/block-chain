-- =============================================================================
-- Migration 017: Migrate to COPm (Mento Colombian Peso)
-- =============================================================================
--
-- Changes:
-- 1. Drop tasa_cambio — COPm = COP 1:1, no exchange rate needed
-- 2. Drop monto_cop — monto es el único campo de valor (COPm directo)
-- 3. Update comment on monto to reflect COPm
--
-- IMPORTANT: This migration assumes NO legacy cUSD data exists.
-- If rolling back, restore migration 009_cop_cusd.sql first.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop tasa_cambio from creditos (no longer needed)
-- ---------------------------------------------------------------------------
ALTER TABLE creditos
  DROP COLUMN tasa_cambio;

-- ---------------------------------------------------------------------------
-- 2. Drop monto_cop — monto es el único campo de valor (COPm directo)
--    COPm = COP 1:1, no se necesita conversión para display
-- ---------------------------------------------------------------------------
ALTER TABLE creditos
  DROP COLUMN monto_cop;

-- ---------------------------------------------------------------------------
-- 3. Update comment on monto
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN creditos.monto IS 'Monto en COPm (human-readable, COPm = COP 1:1) — único campo de valor';
