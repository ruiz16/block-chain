-- =============================================================================
-- Migration 014: Reset Database — Full Schema Reset
-- =============================================================================
--
-- WARNING: This drops EVERYTHING and re-runs all migrations from scratch.
-- Run this ONLY on a fresh/development database. All existing data will
-- be permanently deleted.
--
-- Usage (Supabase CLI):
--   supabase db reset
--
-- Or manually:
--   1. Connect to your database
--   2. Run this file
--   3. Then run all migrations 001-013 in order
-- =============================================================================

-- =============================================================================
-- STEP 1: Drop triggers BEFORE their functions
-- =============================================================================

DROP TRIGGER IF EXISTS trg_gacc_auto_add_creator ON grupos_gacc;
DROP TRIGGER IF EXISTS trg_audit_credito_estado ON creditos;
DROP TRIGGER IF EXISTS trg_creditos_fecha_actualizacion ON creditos;

-- =============================================================================
-- STEP 2: Drop functions (CASCADE will handle any remaining trigger deps)
-- =============================================================================

DROP FUNCTION IF EXISTS gacc_auto_add_creator() CASCADE;
DROP FUNCTION IF EXISTS audit_credito_estado_change() CASCADE;
DROP FUNCTION IF EXISTS update_fecha_actualizacion() CASCADE;

-- =============================================================================
-- STEP 3: Drop tables in dependency order (children before parents)
-- =============================================================================

-- Migration 012 — Referidos y Redes
DROP TABLE IF EXISTS red_miembros CASCADE;
DROP TABLE IF EXISTS redes_apoyo CASCADE;
DROP TABLE IF EXISTS referidos CASCADE;
DROP TABLE IF EXISTS notificaciones CASCADE;
DROP TABLE IF EXISTS cola_email CASCADE;

-- Migration 011 — Score Dinámico
DROP TABLE IF EXISTS eventos_score CASCADE;

-- Migration 008 — Cuotas
DROP TABLE IF EXISTS cuotas CASCADE;

-- Migration 010 — GACC
DROP TABLE IF EXISTS gacc_miembros CASCADE;
DROP TABLE IF EXISTS grupos_gacc CASCADE;

-- Migration 003/007 — Auth / SIWE
DROP TABLE IF EXISTS siwe_nonces CASCADE;

-- Migration 001/002 — Avales
DROP TABLE IF EXISTS avales CASCADE;

-- Migration 001 — Creditos / Audit / Participantes
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS creditos CASCADE;
DROP TABLE IF EXISTS participantes CASCADE;

-- =============================================================================
-- STEP 4: Drop custom enums (in creation order)
-- =============================================================================

DROP TYPE IF EXISTS tipo_accion CASCADE;
DROP TYPE IF EXISTS estado_credito CASCADE;
DROP TYPE IF EXISTS rol_participante CASCADE;

-- =============================================================================
-- STEP 5: Re-run ALL migrations in order
-- =============================================================================

-- 001_schema.sql
-- =============================================================================

CREATE TYPE rol_participante AS ENUM ('prestamista', 'prestatario', 'aval', 'admin');

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

CREATE TABLE participantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  wallet_address text NOT NULL,
  nombre        text NOT NULL,
  rol           rol_participante NOT NULL,
  score_reputacion integer NOT NULL DEFAULT 50 CHECK (score_reputacion >= 0 AND score_reputacion <= 100),
  activo        boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX idx_participantes_wallet_address ON participantes (wallet_address);
CREATE INDEX idx_participantes_rol ON participantes (rol);

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

CREATE INDEX idx_creditos_estado ON creditos (estado);
CREATE INDEX idx_creditos_prestatario_id ON creditos (prestatario_id);

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

CREATE TABLE audit_log (
  id              bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  accion          tipo_accion NOT NULL,
  entidad_tipo    text NOT NULL,
  entidad_id      uuid NOT NULL,
  participante_id uuid REFERENCES participantes (id),
  detalles        jsonb NOT NULL DEFAULT '{}',
  fecha           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE avales ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "audit_log_select_authenticated"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "audit_log_insert_service_role"
  ON audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

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

-- 002_avales.sql
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_avales_credito_id ON avales (credito_id);

-- 003_auth.sql
-- =============================================================================

ALTER TABLE participantes
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_participantes_user_id
  ON participantes (user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "participantes_select_authenticated" ON participantes;
DROP POLICY IF EXISTS "participantes_insert_own" ON participantes;
DROP POLICY IF EXISTS "participantes_update_own" ON participantes;

CREATE POLICY "participantes_select_authenticated"
  ON participantes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR rol = 'admin');

CREATE POLICY "participantes_insert_own"
  ON participantes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "participantes_update_own"
  ON participantes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 004_pago.sql
-- =============================================================================

ALTER TABLE creditos ADD COLUMN tx_hash_pago text;
ALTER TABLE creditos ADD COLUMN fecha_pago timestamptz;

CREATE UNIQUE INDEX idx_creditos_tx_hash_pago ON creditos (tx_hash_pago)
  WHERE tx_hash_pago IS NOT NULL;

-- 005_admin.sql
-- =============================================================================
-- NOTE: 'admin' was already added to rol_participante enum at creation time
-- in 001_schema (unlike the original migration). Only the RLS rewrite applies.

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON audit_log;

CREATE POLICY "audit_log_select_admin_only"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participantes
      WHERE user_id = auth.uid() AND rol = 'admin'
    )
  );

-- 006_loan_terms.sql
-- =============================================================================

ALTER TABLE creditos ADD COLUMN IF NOT EXISTS interes_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS plazo_dias INTEGER NOT NULL DEFAULT 30;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ;

-- 007_siwe.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS siwe_nonces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce           TEXT UNIQUE NOT NULL,
  wallet_address  TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siwe_nonces_nonce ON siwe_nonces (nonce);
CREATE INDEX IF NOT EXISTS idx_siwe_nonces_wallet ON siwe_nonces (wallet_address);

ALTER TABLE participantes
  ADD COLUMN IF NOT EXISTS auth_password TEXT;

-- 008_cuotas.sql
-- =============================================================================

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

CREATE INDEX IF NOT EXISTS idx_cuotas_credito_id ON cuotas (credito_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_estado ON cuotas (estado);

ALTER TABLE creditos ADD COLUMN IF NOT EXISTS numero_cuotas integer NOT NULL DEFAULT 1 CHECK (numero_cuotas > 0);

-- 009_cop_cusd.sql
-- =============================================================================

ALTER TABLE creditos
  ADD COLUMN monto_cop   numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN tasa_cambio numeric(12,2) NOT NULL DEFAULT 4000;

COMMENT ON COLUMN creditos.monto      IS 'Monto en cUSD (blockchain)';
COMMENT ON COLUMN creditos.monto_cop   IS 'Monto original en COP, fijo al solicitar';
COMMENT ON COLUMN creditos.tasa_cambio IS 'COP/cUSD exchange rate al solicitar';

-- 010_gacc.sql
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'gacc_creado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'gacc_creado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'gacc_miembro_validado'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'gacc_miembro_validado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'gacc_miembro_unido'
      AND enumtypid = 'tipo_accion'::regtype
  ) THEN
    ALTER TYPE tipo_accion ADD VALUE 'gacc_miembro_unido';
  END IF;
END $$;

CREATE TABLE grupos_gacc (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 200),
  descripcion text CHECK (descripcion IS NULL OR char_length(descripcion) <= 500),
  codigo      text NOT NULL,
  creador_id  uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_grupos_gacc_codigo ON grupos_gacc (codigo);
CREATE INDEX idx_grupos_gacc_creador_id ON grupos_gacc (creador_id);

CREATE TABLE gacc_miembros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES grupos_gacc (id) ON DELETE CASCADE,
  participante_id   uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  validado_por      uuid REFERENCES participantes (id) ON DELETE SET NULL,
  validado_en       timestamptz,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, participante_id)
);

CREATE INDEX idx_gacc_miembros_grupo_id        ON gacc_miembros (grupo_id);
CREATE INDEX idx_gacc_miembros_participante_id  ON gacc_miembros (participante_id);
CREATE INDEX idx_gacc_miembros_validado_en      ON gacc_miembros (validado_en) WHERE validado_en IS NOT NULL;

ALTER TABLE participantes
  ADD COLUMN gacc_id       uuid REFERENCES grupos_gacc (id) ON DELETE SET NULL,
  ADD COLUMN validado_gacc boolean NOT NULL DEFAULT false;

ALTER TABLE grupos_gacc ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacc_miembros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grupos_gacc_select_authenticated"
  ON grupos_gacc FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "grupos_gacc_insert_authenticated"
  ON grupos_gacc FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "grupos_gacc_update_creator"
  ON grupos_gacc FOR UPDATE
  TO authenticated
  USING (creador_id IN (SELECT id FROM participantes WHERE user_id = auth.uid()))
  WITH CHECK (creador_id IN (SELECT id FROM participantes WHERE user_id = auth.uid()));

CREATE POLICY "gacc_miembros_select_authenticated"
  ON gacc_miembros FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gacc_miembros_insert_authenticated"
  ON gacc_miembros FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "gacc_miembros_update_authenticated"
  ON gacc_miembros FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION gacc_auto_add_creator()
RETURNS trigger AS $$
BEGIN
  INSERT INTO gacc_miembros (grupo_id, participante_id, validado_por, validado_en)
    VALUES (NEW.id, NEW.creador_id, NEW.creador_id, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gacc_auto_add_creator
  AFTER INSERT ON grupos_gacc
  FOR EACH ROW
  EXECUTE FUNCTION gacc_auto_add_creator();

-- 011_score_dinamico.sql
-- =============================================================================

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

CREATE INDEX idx_eventos_score_participante
  ON eventos_score (participante_id, created_at DESC);

-- 012_referidos.sql
-- =============================================================================

ALTER TABLE participantes ADD COLUMN codigo_referido TEXT UNIQUE;

CREATE TABLE referidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referidor_id UUID NOT NULL REFERENCES participantes(id),
  referido_id UUID NOT NULL REFERENCES participantes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(referido_id)
);

CREATE TABLE redes_apoyo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  score_red INTEGER NOT NULL DEFAULT 50,
  estado TEXT NOT NULL DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'rojo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE red_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  red_id UUID NOT NULL REFERENCES redes_apoyo(id),
  participante_id UUID NOT NULL REFERENCES participantes(id),
  es_referidora BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participante_id)
);

CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id UUID NOT NULL REFERENCES participantes(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'bienvenida_red',
    'score_red_mejoro',
    'score_red_empeoro',
    'alerta_48h',
    'alerta_7d',
    'referido_nuevo'
  )),
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_participante ON notificaciones(participante_id, created_at DESC);

CREATE TABLE cola_email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  para TEXT NOT NULL,
  asunto TEXT NOT NULL,
  cuerpo_html TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_at TIMESTAMPTZ
);

-- 013_rls_score_referidos.sql
-- =============================================================================

ALTER TABLE eventos_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_score_select_own"
  ON eventos_score FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "eventos_score_insert_service_role"
  ON eventos_score FOR INSERT
  TO service_role
  WITH CHECK (true);

ALTER TABLE referidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referidos_select_own"
  ON referidos FOR SELECT
  TO authenticated
  USING (referidor_id = auth.uid() OR referido_id = auth.uid());

CREATE POLICY "referidos_insert_service_role"
  ON referidos FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "referidos_update_service_role"
  ON referidos FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE redes_apoyo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redes_apoyo_select_member"
  ON redes_apoyo FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM red_miembros
      WHERE red_miembros.red_id = redes_apoyo.id
        AND red_miembros.participante_id = auth.uid()
    )
  );

CREATE POLICY "redes_apoyo_insert_service_role"
  ON redes_apoyo FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "redes_apoyo_update_service_role"
  ON redes_apoyo FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE red_miembros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "red_miembros_select_own"
  ON red_miembros FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "red_miembros_insert_service_role"
  ON red_miembros FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "red_miembros_update_service_role"
  ON red_miembros FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificaciones_select_own"
  ON notificaciones FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "notificaciones_update_own"
  ON notificaciones FOR UPDATE
  TO authenticated
  USING (participante_id = auth.uid())
  WITH CHECK (participante_id = auth.uid());

CREATE POLICY "notificaciones_insert_service_role"
  ON notificaciones FOR INSERT
  TO service_role
  WITH CHECK (true);

ALTER TABLE cola_email ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cola_email_insert_service_role"
  ON cola_email FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "cola_email_select_service_role"
  ON cola_email FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "cola_email_update_service_role"
  ON cola_email FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- DONE — Schema reset complete
-- =============================================================================
