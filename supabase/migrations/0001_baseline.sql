-- =============================================================================
-- Migration 0001: Baseline — Esquema consolidado de Mangle
-- =============================================================================
-- Estado de la base de datos a fecha 2026-06-14.
--
-- Este archivo CONSOLIDA (squash) las antiguas migraciones 001–031 en un único
-- esquema declarativo, resolviendo los conflictos históricos:
--   - Se eliminó el doble 017 (017_copm / 017_moneda): la columna `moneda` queda
--     definida una sola vez; `monto_cop` y `tasa_cambio` NO existen (fueron
--     dropeadas en 020 — el sistema usa una única moneda: COPm).
--   - `rol_participante` arranca ya simplificado a ('usuario', 'admin').
--   - `creador_id` de grupos_gacc es NULLABLE (modelo GACC con líder pre-asignado).
--   - `municipio` y `oficio` quedan como NOT NULL DEFAULT '' (alineado con telefono
--     y email, y con lo que esperaba mangle-mobile).
--   - Se incorporó el modelo de confianza GACC (029), Web Push (030) y la función
--     recalcular_score_gacc (031).
--
-- IMPORTANTE: aplicar SOLO sobre una base de datos limpia (desarrollo).
-- A partir de aquí, las nuevas migraciones se numeran 0002_, 0003_, ... y NUNCA
-- se reescribe una migración ya aplicada en un entorno compartido o producción.
-- =============================================================================

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

CREATE TYPE rol_participante AS ENUM ('usuario', 'admin');

CREATE TYPE estado_credito AS ENUM (
  'pendiente',
  'avalado',
  'aprobado',
  'desembolsado',
  'pagado',
  'default',
  'expirado'
);

CREATE TYPE tipo_accion AS ENUM (
  'credito_creado',
  'credito_aprobado',
  'desembolso',
  'desembolso_fallo',
  'pago_recibido',
  'default_registrado',
  'aval_agregado',
  'aval_revocado',
  'gacc_creado',
  'gacc_miembro_validado',
  'gacc_miembro_unido',
  'score_actualizado',
  'interes_barrido'
);

-- =============================================================================
-- 2. participantes
-- =============================================================================
-- Se crea sin gacc_id; la FK a grupos_gacc se agrega más abajo (dependencia
-- circular: participantes.gacc_id -> grupos_gacc.creador_id -> participantes).

CREATE TABLE participantes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  wallet_address   text NOT NULL,
  nombre           text NOT NULL,
  rol              rol_participante NOT NULL,
  score_reputacion integer NOT NULL DEFAULT 50 CHECK (score_reputacion >= 0 AND score_reputacion <= 100),
  activo           boolean NOT NULL DEFAULT true,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_password    text,
  validado_gacc    boolean NOT NULL DEFAULT false,
  codigo_referido  text UNIQUE,
  telefono         text NOT NULL DEFAULT '',
  email            text NOT NULL DEFAULT '',
  oficio           text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX idx_participantes_wallet_address ON participantes (wallet_address);
CREATE INDEX idx_participantes_rol ON participantes (rol);
CREATE UNIQUE INDEX idx_participantes_user_id
  ON participantes (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN participantes.auth_password  IS 'Password auto-generado para sesiones Supabase de usuarios SIWE';
COMMENT ON COLUMN participantes.validado_gacc  IS 'El participante ha sido validado por su GACC';
COMMENT ON COLUMN participantes.telefono       IS 'Número de celular del participante, formato libre (+57 310...)';
COMMENT ON COLUMN participantes.oficio         IS 'Oficio ancestral o rol comunitario (texto libre)';

-- =============================================================================
-- 3. creditos
-- =============================================================================

CREATE TABLE creditos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestatario_id      uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  referadora_id       uuid REFERENCES participantes (id) ON DELETE RESTRICT,
  monto               numeric(40,0) NOT NULL CHECK (monto > 0),
  moneda              text NOT NULL DEFAULT 'COPm',
  descripcion         text,
  uso                 text NOT NULL DEFAULT '',
  estado              estado_credito NOT NULL,
  interes_porcentaje  numeric(5,2) NOT NULL DEFAULT 0,
  plazo_dias          integer NOT NULL DEFAULT 30,
  numero_cuotas       integer NOT NULL DEFAULT 1 CHECK (numero_cuotas > 0),
  repayment_mode      text NOT NULL DEFAULT 'legacy' CHECK (repayment_mode IN ('legacy', 'pool')),
  tx_hash             text UNIQUE,
  tx_hash_pago        text,
  fecha_solicitud     timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  fecha_vencimiento   timestamptz,
  fecha_pago          timestamptz,
  expiracion_en       timestamptz
);

CREATE INDEX idx_creditos_estado         ON creditos (estado);
CREATE INDEX idx_creditos_prestatario_id ON creditos (prestatario_id);
CREATE INDEX idx_creditos_referadora_id  ON creditos (referadora_id);
CREATE UNIQUE INDEX idx_creditos_tx_hash_pago ON creditos (tx_hash_pago)
  WHERE tx_hash_pago IS NOT NULL;

COMMENT ON COLUMN creditos.monto          IS 'Monto en COPm (wei, 18 decimales)';
COMMENT ON COLUMN creditos.moneda         IS 'Siempre COPm — única moneda del sistema';
COMMENT ON COLUMN creditos.uso            IS 'Propósito del crédito (insumos, herramientas, mercancía, etc.)';
COMMENT ON COLUMN creditos.referadora_id  IS 'Miembro del mismo GACC elegido por el solicitante como aval directo (1/2)';
COMMENT ON COLUMN creditos.repayment_mode IS 'legacy = Transfer a platform wallet; pool = evento Repaid del LendingPool';
COMMENT ON COLUMN creditos.tx_hash        IS 'Tx hash del desembolso en COPm';
COMMENT ON COLUMN creditos.tx_hash_pago   IS 'Tx hash del pago total (créditos de 1 cuota) en COPm';
COMMENT ON COLUMN creditos.expiracion_en  IS 'Fecha de expiración (7 días después de la solicitud). Sin avales suficientes para esa fecha, se marca como expirado.';

-- =============================================================================
-- 4. avales
-- =============================================================================

CREATE TABLE avales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aval_id        uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  prestatario_id uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  credito_id     uuid NOT NULL REFERENCES creditos (id) ON DELETE RESTRICT,
  monto_maximo   numeric(40,0) NOT NULL CHECK (monto_maximo > 0),
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  activo         boolean NOT NULL DEFAULT true,
  rol_aval       text CHECK (rol_aval IN ('referadora', 'lider')),
  UNIQUE (aval_id, credito_id)
);

CREATE INDEX idx_avales_credito_id ON avales (credito_id);
CREATE INDEX idx_avales_aval_id    ON avales (aval_id);

COMMENT ON COLUMN avales.rol_aval IS 'Rol del aval en el circuito GACC: referadora (1/2) o lider (2/2)';

-- =============================================================================
-- 5. audit_log
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

CREATE INDEX idx_audit_log_participante_id ON audit_log (participante_id);
CREATE INDEX idx_audit_log_entidad_id      ON audit_log (entidad_id);

-- =============================================================================
-- 6. siwe_nonces  (Sign-In with Ethereum, EIP-4361)
-- =============================================================================

CREATE TABLE siwe_nonces (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce          text UNIQUE NOT NULL,
  wallet_address text NOT NULL,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_siwe_nonces_nonce  ON siwe_nonces (nonce);
CREATE INDEX idx_siwe_nonces_wallet ON siwe_nonces (wallet_address);

-- =============================================================================
-- 7. cuotas  (installments)
-- =============================================================================

CREATE TABLE cuotas (
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

CREATE INDEX idx_cuotas_credito_id ON cuotas (credito_id);
CREATE INDEX idx_cuotas_estado     ON cuotas (estado);

COMMENT ON COLUMN cuotas.monto_capital  IS 'Capital en COPm (wei)';
COMMENT ON COLUMN cuotas.monto_interes  IS 'Interés en COPm (wei)';
COMMENT ON COLUMN cuotas.monto_cuota    IS 'Cuota total (capital + interés) en COPm (wei)';
COMMENT ON COLUMN cuotas.saldo_restante IS 'Saldo pendiente en COPm (wei)';
COMMENT ON COLUMN cuotas.tx_hash_pago   IS 'Tx hash del pago en COPm';

-- =============================================================================
-- 8. grupos_gacc  (Grupos de Ahorro y Crédito Comunitario)
-- =============================================================================

CREATE TABLE grupos_gacc (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 200),
  descripcion text CHECK (descripcion IS NULL OR char_length(descripcion) <= 500),
  codigo      text NOT NULL,
  creador_id  uuid REFERENCES participantes (id) ON DELETE RESTRICT,
  lider_id    uuid REFERENCES participantes (id) ON DELETE SET NULL,
  email_lider text,
  municipio   text NOT NULL DEFAULT '',
  score_gacc  numeric(5,2) NOT NULL DEFAULT 0,
  estado      text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'restringido', 'inactivo')),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_grupos_gacc_codigo     ON grupos_gacc (codigo);
CREATE INDEX        idx_grupos_gacc_creador_id ON grupos_gacc (creador_id);
CREATE INDEX        idx_grupos_gacc_lider_id   ON grupos_gacc (lider_id);

COMMENT ON TABLE  grupos_gacc             IS 'Grupos de Ahorro y Crédito Comunitario';
COMMENT ON COLUMN grupos_gacc.codigo      IS 'Código compartible para unirse al grupo (ej. MANGLE-XXXX)';
COMMENT ON COLUMN grupos_gacc.creador_id  IS 'Participante que creó el grupo (creador automático es primer miembro)';
COMMENT ON COLUMN grupos_gacc.lider_id    IS 'Participante que quedó como Líder Social (match de email_lider al unirse)';
COMMENT ON COLUMN grupos_gacc.email_lider IS 'Correo del Líder Social pre-asignado por el FLD al crear el grupo';
COMMENT ON COLUMN grupos_gacc.score_gacc  IS 'Media aritmética de score_reputacion de los miembros activos del grupo';
COMMENT ON COLUMN grupos_gacc.estado      IS 'Estado operativo: activo | restringido (penalización colectiva) | inactivo';
COMMENT ON COLUMN grupos_gacc.municipio   IS 'Territorio al que pertenece el GACC (guapi, timbiqui, etc.)';

-- Cerrar la dependencia circular: participantes.gacc_id -> grupos_gacc
ALTER TABLE participantes
  ADD COLUMN gacc_id uuid REFERENCES grupos_gacc (id) ON DELETE SET NULL;

COMMENT ON COLUMN participantes.gacc_id IS 'GACC al que pertenece el participante';

-- =============================================================================
-- 9. gacc_miembros
-- =============================================================================

CREATE TABLE gacc_miembros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id        uuid NOT NULL REFERENCES grupos_gacc (id) ON DELETE CASCADE,
  participante_id uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  validado_por    uuid REFERENCES participantes (id) ON DELETE SET NULL,
  validado_en     timestamptz,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, participante_id)
);

CREATE INDEX idx_gacc_miembros_grupo_id        ON gacc_miembros (grupo_id);
CREATE INDEX idx_gacc_miembros_participante_id ON gacc_miembros (participante_id);
CREATE INDEX idx_gacc_miembros_validado_en     ON gacc_miembros (validado_en) WHERE validado_en IS NOT NULL;

COMMENT ON TABLE  gacc_miembros             IS 'Miembros de un GACC';
COMMENT ON COLUMN gacc_miembros.validado_por IS 'Participante que validó a este miembro (NULL = pendiente)';
COMMENT ON COLUMN gacc_miembros.validado_en  IS 'Momento de validación (NULL = pendiente)';

-- =============================================================================
-- 10. eventos_score  (historial de score dinámico)
-- =============================================================================

CREATE TABLE eventos_score (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  tipo_evento     text NOT NULL CHECK (tipo_evento IN (
    'pago_puntual', 'pago_atrasado', 'default', 'recalculo_manual'
  )),
  delta           integer NOT NULL,
  score_anterior  integer NOT NULL,
  score_nuevo     integer NOT NULL,
  referencia_tipo text CHECK (referencia_tipo IN ('credito', 'cuota')),
  referencia_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eventos_score_participante
  ON eventos_score (participante_id, created_at DESC);

COMMENT ON TABLE  eventos_score             IS 'Historial de cambios en el score de reputación';
COMMENT ON COLUMN eventos_score.delta       IS 'Cambio neto aplicado al score (+2, -1, -15)';

-- =============================================================================
-- 11. Referidos y Redes de Apoyo (modelo heredado, conservado por compatibilidad)
-- =============================================================================

CREATE TABLE referidos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referidor_id uuid NOT NULL REFERENCES participantes(id),
  referido_id  uuid NOT NULL REFERENCES participantes(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  activo       boolean NOT NULL DEFAULT true,
  UNIQUE(referido_id)
);

CREATE TABLE redes_apoyo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  score_red  integer NOT NULL DEFAULT 50,
  estado     text NOT NULL DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'rojo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE red_miembros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  red_id          uuid NOT NULL REFERENCES redes_apoyo(id),
  participante_id uuid NOT NULL REFERENCES participantes(id),
  es_referidora   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participante_id)
);

-- Notificaciones in-app (CHECK ya con los tipos del modelo GACC, migración 029)
CREATE TABLE notificaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES participantes(id),
  tipo            text NOT NULL CHECK (tipo IN (
    -- Heredados (modelo referidos/redes)
    'bienvenida_red',
    'score_red_mejoro',
    'score_red_empeoro',
    'alerta_48h',
    'alerta_7d',
    'referido_nuevo',
    -- Modelo GACC
    'aval_requerido',
    'aval_lider_requerido',
    'mora_referadora',
    'mora_lider',
    'gacc_restringido'
  )),
  titulo     text NOT NULL,
  cuerpo     text NOT NULL,
  leida      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_participante ON notificaciones(participante_id, created_at DESC);

CREATE TABLE cola_email (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  para        text NOT NULL,
  asunto      text NOT NULL,
  cuerpo_html text NOT NULL,
  estado      text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  enviado_at  timestamptz
);

-- =============================================================================
-- 12. Educación financiera
-- =============================================================================

CREATE TABLE modulos_educativos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden      integer NOT NULL CHECK (orden > 0),
  sender     text NOT NULL CHECK (sender IN ('system', 'whatsapp_fld')),
  mensaje    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_modulos_orden ON modulos_educativos (orden);

INSERT INTO modulos_educativos (orden, sender, mensaje) VALUES
  (1, 'system',
    'Has iniciado tu proceso formativo. ¡Bienvenida a tu camino de autonomía!'
  ),
  (2, 'whatsapp_fld',
    '🍃 **Lección 1:** El GACC es un fondo común. Si una persona del grupo presenta dificultad, las demás brindamos apoyo. No hay cobradores externos, nos respaldamos entre nosotras.'
  ),
  (3, 'whatsapp_fld',
    '💡 **Lección 2:** El pago oportuno mejora tu *Score de Confianza* (Credencial NFT), permitiendo que todo tu grupo acceda a montos más altos en el siguiente ciclo.'
  ),
  (4, 'whatsapp_fld',
    '¡Felicidades! Has completado el módulo. Ahora estás lista para ingresar el monto del microcrédito que necesitas para tu negocio.'
  );

CREATE TABLE progreso_educacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  modulo_actual   integer NOT NULL DEFAULT 1,
  completado      boolean NOT NULL DEFAULT false,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progreso_educacion_participante_unique UNIQUE (participante_id)
);

CREATE INDEX idx_progreso_participante ON progreso_educacion (participante_id);

-- =============================================================================
-- 13. push_subscriptions  (Web Push / VAPID)
-- =============================================================================

CREATE TABLE push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES participantes (id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_participante
  ON push_subscriptions (participante_id);

COMMENT ON TABLE  push_subscriptions          IS 'Suscripciones Web Push (VAPID) por participante';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Endpoint único del push service del navegador';
COMMENT ON COLUMN push_subscriptions.p256dh   IS 'Clave pública del cliente para cifrar el payload';
COMMENT ON COLUMN push_subscriptions.auth     IS 'Secreto de autenticación de la suscripción';

-- =============================================================================
-- 14. FUNCIONES Y TRIGGERS
-- =============================================================================

-- Auto-update fecha_actualizacion en creditos
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

-- Auditoría automática de cambios de estado en creditos
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

CREATE TRIGGER trg_audit_credito_estado
  AFTER UPDATE OF estado ON creditos
  FOR EACH ROW
  EXECUTE FUNCTION audit_credito_estado_change();

-- Auto-insertar al creador como primer miembro validado del GACC
CREATE OR REPLACE FUNCTION gacc_auto_add_creator()
RETURNS trigger AS $$
BEGIN
  IF NEW.creador_id IS NOT NULL THEN
    INSERT INTO gacc_miembros (grupo_id, participante_id, validado_por, validado_en)
      VALUES (NEW.id, NEW.creador_id, NEW.creador_id, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gacc_auto_add_creator
  AFTER INSERT ON grupos_gacc
  FOR EACH ROW
  EXECUTE FUNCTION gacc_auto_add_creator();

-- Recalcular score grupal (media de score_reputacion de miembros activos)
CREATE OR REPLACE FUNCTION recalcular_score_gacc(grupo uuid)
RETURNS numeric AS $$
DECLARE
  nuevo_score numeric(5,2);
BEGIN
  SELECT COALESCE(AVG(score_reputacion), 0)::numeric(5,2)
    INTO nuevo_score
    FROM participantes
    WHERE gacc_id = grupo
      AND activo = true;

  UPDATE grupos_gacc
    SET score_gacc = nuevo_score
    WHERE id = grupo;

  RETURN nuevo_score;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalcular_score_gacc(uuid) IS
  'Recalcula grupos_gacc.score_gacc como media de score_reputacion de miembros activos';

-- =============================================================================
-- 15. ROW LEVEL SECURITY
-- =============================================================================
-- La app opera con service-role; RLS es defensa-en-profundidad contra acceso
-- directo a la base de datos.

ALTER TABLE participantes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE avales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupos_gacc        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacc_miembros      ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_score      ENABLE ROW LEVEL SECURITY;
ALTER TABLE referidos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE redes_apoyo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_miembros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cola_email         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- participantes
CREATE POLICY "participantes_select_authenticated"
  ON participantes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR rol = 'admin');

CREATE POLICY "participantes_insert_own"
  ON participantes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "participantes_update_own"
  ON participantes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- creditos
CREATE POLICY "creditos_select_authenticated"
  ON creditos FOR SELECT TO authenticated USING (true);

CREATE POLICY "creditos_insert_authenticated"
  ON creditos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "creditos_update_estado"
  ON creditos FOR UPDATE TO authenticated USING (true);

-- avales
CREATE POLICY "avales_select_authenticated"
  ON avales FOR SELECT TO authenticated USING (true);

CREATE POLICY "avales_insert_authenticated"
  ON avales FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "avales_update_authenticated"
  ON avales FOR UPDATE TO authenticated USING (true);

-- audit_log (append-only; SELECT solo admins)
CREATE POLICY "audit_log_select_admin_only"
  ON audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participantes
      WHERE user_id = auth.uid() AND rol = 'admin'
    )
  );

CREATE POLICY "audit_log_insert_service_role"
  ON audit_log FOR INSERT TO service_role WITH CHECK (true);

-- grupos_gacc
CREATE POLICY "grupos_gacc_select_authenticated"
  ON grupos_gacc FOR SELECT TO authenticated USING (true);

CREATE POLICY "grupos_gacc_insert_authenticated"
  ON grupos_gacc FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "grupos_gacc_update_creator"
  ON grupos_gacc FOR UPDATE TO authenticated
  USING (creador_id IN (SELECT id FROM participantes WHERE user_id = auth.uid()))
  WITH CHECK (creador_id IN (SELECT id FROM participantes WHERE user_id = auth.uid()));

-- gacc_miembros
CREATE POLICY "gacc_miembros_select_authenticated"
  ON gacc_miembros FOR SELECT TO authenticated USING (true);

CREATE POLICY "gacc_miembros_insert_authenticated"
  ON gacc_miembros FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "gacc_miembros_update_authenticated"
  ON gacc_miembros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- eventos_score
CREATE POLICY "eventos_score_select_own"
  ON eventos_score FOR SELECT TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "eventos_score_insert_service_role"
  ON eventos_score FOR INSERT TO service_role WITH CHECK (true);

-- referidos
CREATE POLICY "referidos_select_own"
  ON referidos FOR SELECT TO authenticated
  USING (referidor_id = auth.uid() OR referido_id = auth.uid());

CREATE POLICY "referidos_insert_service_role"
  ON referidos FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "referidos_update_service_role"
  ON referidos FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- redes_apoyo
CREATE POLICY "redes_apoyo_select_member"
  ON redes_apoyo FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM red_miembros
      WHERE red_miembros.red_id = redes_apoyo.id
        AND red_miembros.participante_id = auth.uid()
    )
  );

CREATE POLICY "redes_apoyo_insert_service_role"
  ON redes_apoyo FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "redes_apoyo_update_service_role"
  ON redes_apoyo FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- red_miembros
CREATE POLICY "red_miembros_select_own"
  ON red_miembros FOR SELECT TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "red_miembros_insert_service_role"
  ON red_miembros FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "red_miembros_update_service_role"
  ON red_miembros FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- notificaciones
CREATE POLICY "notificaciones_select_own"
  ON notificaciones FOR SELECT TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "notificaciones_update_own"
  ON notificaciones FOR UPDATE TO authenticated
  USING (participante_id = auth.uid())
  WITH CHECK (participante_id = auth.uid());

CREATE POLICY "notificaciones_insert_service_role"
  ON notificaciones FOR INSERT TO service_role WITH CHECK (true);

-- cola_email
CREATE POLICY "cola_email_insert_service_role"
  ON cola_email FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "cola_email_select_service_role"
  ON cola_email FOR SELECT TO service_role USING (true);

CREATE POLICY "cola_email_update_service_role"
  ON cola_email FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- push_subscriptions
CREATE POLICY "push_subscriptions_select_own"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "push_subscriptions_delete_own"
  ON push_subscriptions FOR DELETE TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "push_subscriptions_insert_service_role"
  ON push_subscriptions FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "push_subscriptions_update_service_role"
  ON push_subscriptions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- FIN — Baseline consolidado (estado a 2026-06-14, equivalente a migraciones 001–031)
-- =============================================================================
