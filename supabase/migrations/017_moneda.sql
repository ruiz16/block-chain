-- =============================================================================
-- Migration 017: Add moneda column to creditos
-- =============================================================================
--
-- Adds an explicit currency field to each credit so the system can track
-- whether the loan was originated in COPm (Colombian Pesos, the default) or
-- in cUSD (Celo Dollar, for future direct USD loans).
--
-- The monto field always stores cUSD (wei) for blockchain operations, and
-- monto_cop stores the original COP/COPm amount. The moneda field makes
-- explicit which currency the user requested in at creation time.
-- =============================================================================

ALTER TABLE creditos
  ADD COLUMN moneda text NOT NULL DEFAULT 'COPm';

COMMENT ON COLUMN creditos.moneda IS 'Moneda de origen: COPm (Colombian Pesos) o cUSD (Celo Dollar)';

-- Existing credits are all COPm-originated
UPDATE creditos SET moneda = 'COPm' WHERE moneda IS NULL;
