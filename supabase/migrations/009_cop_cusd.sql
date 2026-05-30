-- =============================================================================
-- Migration 009: Store COP amount + exchange rate on creditos
-- =============================================================================
--
-- Adds monto_cop (original COP amount) and tasa_cambio (COP/cUSD rate)
-- so the UI always shows exactly what the borrower requested in COP.
--
-- credito.monto remains as cUSD (for blockchain operations).
-- COP for each cuota is derived: COP = cuota.monto_cuota * credito.tasa_cambio
-- =============================================================================

ALTER TABLE creditos
  ADD COLUMN monto_cop   numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN tasa_cambio numeric(12,2) NOT NULL DEFAULT 4000;

COMMENT ON COLUMN creditos.monto      IS 'Monto en cUSD (blockchain)';
COMMENT ON COLUMN creditos.monto_cop   IS 'Monto original en COP, fijo al solicitar';
COMMENT ON COLUMN creditos.tasa_cambio IS 'COP/cUSD exchange rate al solicitar';

-- Backfill: existing records used tasa 4000
UPDATE creditos
SET
  monto_cop   = ROUND(CAST(monto AS numeric) * 4000),
  tasa_cambio = 4000
WHERE monto_cop = 0;
