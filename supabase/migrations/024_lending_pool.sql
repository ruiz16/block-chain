-- =============================================================================
-- 024_lending_pool.sql — modo de repago por crédito
-- =============================================================================
-- 'legacy' → repago verificado por Transfer directo a la platform wallet (flujo histórico)
-- 'pool'   → repago verificado por el evento Repaid del LendingPool
-- Default 'legacy': todos los créditos existentes mantienen su flujo.
-- El desembolso vía LendingPool marca el crédito como 'pool'.
-- =============================================================================

ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS repayment_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (repayment_mode IN ('legacy', 'pool'));

COMMENT ON COLUMN creditos.repayment_mode IS
  'legacy = Transfer a platform wallet; pool = evento Repaid del LendingPool';
