-- =============================================================================
-- Migration 001: Schema inicial para plataforma de micro-créditos
-- =============================================================================
-- Custom enums
-- =============================================================================

CREATE TYPE rol_participante AS ENUM ('prestamista', 'prestatario', 'aval');

CREATE TYPE estado_credito AS ENUM (
  'pendiente',
  'avalado',
  'aprobado',
  'desembolsado',
  'pagado',
  'default'
);

CREATE TYPE tipo_accion AS ENUM (
  'credito_creado',
  'credito_aprobado',
  'desembolso',
  'desembolso_fallo',
  'pago_recibido',
  'default_registrado'
);

-- =============================================================================
-- Table: participantes
-- =============================================================================

CREATE TABLE participantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  wallet_address text NOT NULL,
  nombre        text NOT NULL,
  rol           rol_participante NOT NULL,
  score_reputacion integer NOT NULL DEFAULT 50 CHECK (score_reputacion >= 0 AND score_reputacion <= 100),
  activo        boolean NOT NULL DEFAULT true
);

-- Unique index on wallet_address
CREATE UNIQUE INDEX idx_participantes_wallet_address ON participantes (wallet_address);

-- Index on rol for role-based queries
CREATE INDEX idx_participantes_rol ON participantes (rol);

-- =============================================================================
-- Table: creditos
-- =============================================================================

CREATE TABLE creditos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestatario_id uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  monto         numeric(40,0) NOT NULL CHECK (monto > 0),
  descripcion   text,
  estado        estado_credito NOT NULL,
  tx_hash       text UNIQUE,
  fecha_solicitud      timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_creditos_estado ON creditos (estado);
CREATE INDEX idx_creditos_prestatario_id ON creditos (prestatario_id);

-- =============================================================================
-- Table: avales
-- =============================================================================

CREATE TABLE avales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aval_id       uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  prestatario_id uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  credito_id    uuid NOT NULL REFERENCES creditos (id) ON DELETE RESTRICT,
  monto_maximo  numeric(40,0) NOT NULL CHECK (monto_maximo > 0),
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  activo        boolean NOT NULL DEFAULT true,
  UNIQUE (prestatario_id, credito_id)
);

-- =============================================================================
-- Table: audit_log
-- =============================================================================

CREATE TABLE audit_log (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  accion          tipo_accion NOT NULL,
  entidad_tipo    text NOT NULL,
  entidad_id      uuid NOT NULL,
  participante_id uuid REFERENCES participantes (id),
  detalles        jsonb NOT NULL DEFAULT '{}',
  fecha           timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avales ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Participantes policies
CREATE POLICY "participantes_select_authenticated"
  ON participantes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "participantes_insert_own"
  ON participantes FOR INSERT
  TO authenticated
  WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "participantes_update_own"
  ON participantes FOR UPDATE
  TO authenticated
  USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address')
  WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Creditos policies
CREATE POLICY "creditos_select_authenticated"
  ON creditos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "creditos_update_estado"
  ON creditos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "creditos_insert_authenticated"
  ON creditos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Avales policies
CREATE POLICY "avales_select_authenticated"
  ON avales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "avales_insert_authenticated"
  ON avales FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "avales_update_authenticated"
  ON avales FOR UPDATE
  TO authenticated
  USING (true);

-- Audit log policies (INSERT-only via service_role, SELECT for authenticated)
CREATE POLICY "audit_log_select_authenticated"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "audit_log_insert_service_role"
  ON audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- NOTE: No UPDATE or DELETE policies on audit_log — it is append-only.

-- =============================================================================
-- Trigger: auto-update fecha_actualizacion on creditos
-- =============================================================================

CREATE OR REPLACE FUNCTION update_fecha_actualizacion()
RETURNS trigger AS $$
BEGIN
  NEW.fecha_actualizacion = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_creditos_fecha_actualizacion
  BEFORE UPDATE ON creditos
  FOR EACH ROW
  EXECUTE FUNCTION update_fecha_actualizacion();

-- =============================================================================
-- Trigger: auto-audit on creditos.estado changes
-- =============================================================================

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

CREATE TRIGGER trg_audit_credito_estado
  AFTER UPDATE OF estado ON creditos
  FOR EACH ROW
  EXECUTE FUNCTION audit_credito_estado_change();
