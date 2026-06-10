-- =============================================================================
-- Migration 020: Purge cUSD — pure COPm
-- =============================================================================
--
-- Elimina todas las columnas y conceptos relacionados a cUSD/USD.
-- Ahora credito.monto es directamente COPm (wei, 18 decimales),
-- no "cUSD equivalente". No hay conversión COP/cUSD.
--
-- Se dropean:
--   creditos.monto_cop   — sobra, monto ya es COPm
--   creditos.tasa_cambio — sobra, no hay conversión
--
-- La columna moneda se conserva pero simplificada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dropear columnas de conversión COP/cUSD
-- ---------------------------------------------------------------------------
ALTER TABLE creditos DROP COLUMN IF EXISTS monto_cop;
ALTER TABLE creditos DROP COLUMN IF EXISTS tasa_cambio;

-- ---------------------------------------------------------------------------
-- 2. Actualizar comments — todo es COPm ahora
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN creditos.monto      IS 'Monto en COPm (wei, 18 decimales)';
COMMENT ON COLUMN creditos.moneda     IS 'Siempre COPm — única moneda del sistema';
COMMENT ON COLUMN cuotas.monto_capital  IS 'Capital en COPm (wei)';
COMMENT ON COLUMN cuotas.monto_interes  IS 'Interés en COPm (wei)';
COMMENT ON COLUMN cuotas.monto_cuota    IS 'Cuota total (capital + interés) en COPm (wei)';
COMMENT ON COLUMN cuotas.saldo_restante IS 'Saldo pendiente en COPm (wei)';
COMMENT ON COLUMN cuotas.tx_hash_pago   IS 'Tx hash del pago en COPm';
COMMENT ON COLUMN creditos.tx_hash      IS 'Tx hash del desembolso en COPm';
COMMENT ON COLUMN creditos.tx_hash_pago IS 'Tx hash del pago total (créditos de 1 cuota) en COPm';
