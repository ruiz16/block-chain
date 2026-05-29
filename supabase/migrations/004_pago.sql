-- =============================================================================
-- Migration 004: Fecha de pago y hash de transacción de pago
-- =============================================================================
-- Adds columns to track repayment transactions on the creditos table.
--
-- tx_hash_pago: stores the transaction hash of the borrower's cUSD repayment
-- fecha_pago: timestamp when the payment was registered
--
-- The unique partial index on tx_hash_pago prevents the same transaction
-- hash from being used to repay multiple credits (TX_HASH_DUPLICADO).
-- =============================================================================

ALTER TABLE creditos ADD COLUMN tx_hash_pago text;
ALTER TABLE creditos ADD COLUMN fecha_pago timestamptz;

-- Unique partial index — only non-null values must be unique
CREATE UNIQUE INDEX idx_creditos_tx_hash_pago ON creditos (tx_hash_pago)
  WHERE tx_hash_pago IS NOT NULL;

-- =============================================================================
-- Rollback:
--   DROP INDEX IF EXISTS idx_creditos_tx_hash_pago;
--   ALTER TABLE creditos DROP COLUMN IF EXISTS tx_hash_pago;
--   ALTER TABLE creditos DROP COLUMN IF EXISTS fecha_pago;
-- =============================================================================
