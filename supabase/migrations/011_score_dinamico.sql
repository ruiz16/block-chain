-- =============================================================================
-- Migration 011: Score Dinámico de Reputación
-- =============================================================================
--
-- Agrega sistema de eventos de score para tracking de reputación.
-- El score base se almacena en participantes.score_reputacion (existente).
-- La antigüedad se calcula on-read (no se persiste como evento).
--
-- Rollback:
--   DROP TABLE IF EXISTS eventos_score;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tipo_accion value for audit log
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'score_actualizado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'score_actualizado';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Table: eventos_score
-- ---------------------------------------------------------------------------
CREATE TABLE eventos_score (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id   uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  tipo_evento       text NOT NULL CHECK (tipo_evento IN (
    'pago_puntual', 'pago_atrasado', 'default', 'recalculo_manual'
  )),
  delta             integer NOT NULL,
  score_anterior    integer NOT NULL,
  score_nuevo       integer NOT NULL,
  referencia_tipo   text CHECK (referencia_tipo IN ('credito', 'cuota')),
  referencia_id     uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for fast participant history queries
CREATE INDEX idx_eventos_score_participante
  ON eventos_score (participante_id, created_at DESC);

COMMENT ON TABLE  eventos_score              IS 'Historial de cambios en el score de reputación';
COMMENT ON COLUMN eventos_score.tipo_evento  IS 'Tipo de evento que disparó el cambio';
COMMENT ON COLUMN eventos_score.delta        IS 'Cambio neto aplicado al score (+2, -1, -15)';
COMMENT ON COLUMN eventos_score.referencia_id IS 'ID del crédito o cuota asociada al evento';
