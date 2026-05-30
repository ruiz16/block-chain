-- =============================================================================
-- Migration 008: Cuotas (Installments) System
-- =============================================================================
--
-- Adds installment (cuota) support to the credit system. Credits can now be
-- divided into N equal cuotas that are paid individually. The schema is
-- designed to support future amortization (capital + interest per cuota)
-- while using simple division for now.
--
-- Changes:
--   1. New `cuotas` table with per-cuota breakdown
--   2. ALTER creditos: add `numero_cuotas` column
--   3. Backfill: generate single cuota for existing credits
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create cuotas table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cuotas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credito_id        uuid NOT NULL REFERENCES creditos(id) ON DELETE RESTRICT,
  numero_cuota      integer NOT NULL CHECK (numero_cuota > 0),
  monto_capital     numeric(40,0) NOT NULL CHECK (monto_capital > 0),
  monto_interes     numeric(40,0) NOT NULL CHECK (monto_interes >= 0),
  monto_cuota       numeric(40,0) NOT NULL CHECK (monto_cuota > 0),
  saldo_restante    numeric(40,0) NOT NULL CHECK (saldo_restante >= 0),
  fecha_vencimiento timestamptz NOT NULL,
  estado            text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
  tx_hash_pago      text,
  fecha_pago        timestamptz,
  fecha_creacion    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(credito_id, numero_cuota)
);

-- Index for listing pending cuotas by credit
CREATE INDEX IF NOT EXISTS idx_cuotas_credito_id ON cuotas (credito_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_estado ON cuotas (estado);

-- ---------------------------------------------------------------------------
-- 2. Add numero_cuotas column to creditos
-- ---------------------------------------------------------------------------

ALTER TABLE creditos ADD COLUMN IF NOT EXISTS numero_cuotas integer NOT NULL DEFAULT 1 CHECK (numero_cuotas > 0);

-- ---------------------------------------------------------------------------
-- 3. Backfill: generate single cuota for existing disbursed credits
-- ---------------------------------------------------------------------------

INSERT INTO cuotas (
  credito_id,
  numero_cuota,
  monto_capital,
  monto_interes,
  monto_cuota,
  saldo_restante,
  fecha_vencimiento,
  estado,
  tx_hash_pago,
  fecha_pago
)
SELECT
  c.id,
  1,
  c.monto,                                             -- capital = total
  FLOOR(c.monto * COALESCE(c.interes_porcentaje, 0) / 100), -- interes simple
  c.monto + FLOOR(c.monto * COALESCE(c.interes_porcentaje, 0) / 100), -- total
  0,                                                   -- saldo_restante after payment
  COALESCE(c.fecha_vencimiento, c.fecha_solicitud + INTERVAL '30 days'),
  CASE
    WHEN c.estado = 'pagado' THEN 'pagada'
    WHEN c.estado IN ('desembolsado', 'default') THEN 'pendiente'
    ELSE 'pendiente'
  END,
  c.tx_hash_pago,
  c.fecha_pago
FROM creditos c
WHERE c.estado IN ('desembolsado', 'pagado', 'default')
  AND NOT EXISTS (
    SELECT 1 FROM cuotas WHERE credito_id = c.id
  );
