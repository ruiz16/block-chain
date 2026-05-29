-- =============================================================================
-- Migration 002: Extend tipo_accion enum, fix trigger CASE, add index
-- =============================================================================
-- This migration is idempotent and safe to run multiple times.
--
-- 1. Adds 'aval_agregado' and 'aval_revocado' to tipo_accion enum
-- 2. Fixes audit_credito_estado_change() CASE to map 'avalado' correctly
-- 3. Adds index on avales(credito_id) for query performance
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add new enum values idempotently
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'aval_agregado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'aval_agregado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'aval_revocado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'aval_revocado';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fix trigger function: correctly map 'avalado' transitions
-- ---------------------------------------------------------------------------
-- The original CASE had no WHEN for 'avalado', so it fell through to ELSE
-- and was incorrectly logged as 'credito_aprobado'. We also handle the
-- reverse transition (avalado → pendiente on last aval revoke).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_credito_estado_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO audit_log (accion, entidad_tipo, entidad_id, participante_id, detalles)
      VALUES (
        CASE
          WHEN NEW.estado = 'desembolsado' THEN 'desembolso'::tipo_accion
          WHEN NEW.estado = 'pagado' THEN 'pago_recibido'::tipo_accion
          WHEN NEW.estado = 'default' THEN 'default_registrado'::tipo_accion
          WHEN NEW.estado = 'avalado' THEN 'aval_agregado'::tipo_accion
          WHEN OLD.estado = 'avalado' AND NEW.estado = 'pendiente' THEN 'aval_revocado'::tipo_accion
          ELSE 'credito_aprobado'::tipo_accion
        END,
      'credito',
      NEW.id,
      NEW.prestatario_id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'monto', NEW.monto,
        'tx_hash', NEW.tx_hash
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Add index on avales(credito_id) for faster lookups
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_avales_credito_id ON avales (credito_id);
