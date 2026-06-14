-- =============================================================================
-- Migration 029: Modelo de Confianza GACC (Referadora por Crédito + Líder Social)
-- =============================================================================
--
-- Implementa la Especificación de Arquitectura GACC. Reemplaza el modelo de
-- "3 avales de cualquier miembro" por uno transaccional:
--   - El solicitante elige una referadora por cada crédito (creditos.referadora_id)
--   - Aval 1/2 lo otorga esa referadora; aval 2/2 el Líder Social del grupo
--   - El Líder Social se resuelve a nivel de grupo (grupos_gacc.lider_id) cuando
--     alguien se une con un email que coincide con grupos_gacc.email_lider
--   - score_gacc = media de los scores individuales del grupo
--   - estado del grupo soporta penalización colectiva ('restringido')
--
-- NO se eliminan tablas heredadas (referidos/redes_apoyo/red_miembros/
-- codigo_referido); su limpieza es una tarea futura aparte.
--
-- Rollback:
--   ALTER TABLE grupos_gacc DROP COLUMN IF EXISTS email_lider;
--   ALTER TABLE grupos_gacc DROP COLUMN IF EXISTS lider_id;
--   ALTER TABLE grupos_gacc DROP COLUMN IF EXISTS score_gacc;
--   ALTER TABLE grupos_gacc DROP COLUMN IF EXISTS estado;
--   ALTER TABLE creditos    DROP COLUMN IF EXISTS referadora_id;
--   ALTER TABLE avales      DROP COLUMN IF EXISTS rol_aval;
--   -- (el CHECK de notificaciones.tipo se restauraría a su lista original)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. grupos_gacc — Líder Social, score grupal y estado operativo
-- ---------------------------------------------------------------------------
ALTER TABLE grupos_gacc
  ADD COLUMN IF NOT EXISTS email_lider text;

ALTER TABLE grupos_gacc
  ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES participantes (id) ON DELETE SET NULL;

ALTER TABLE grupos_gacc
  ADD COLUMN IF NOT EXISTS score_gacc numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE grupos_gacc
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'restringido', 'inactivo'));

CREATE INDEX IF NOT EXISTS idx_grupos_gacc_lider_id ON grupos_gacc (lider_id);

COMMENT ON COLUMN grupos_gacc.email_lider IS
  'Correo del Líder Social pre-asignado por el FLD al crear el grupo';
COMMENT ON COLUMN grupos_gacc.lider_id IS
  'Participante que quedó como Líder Social (match de email_lider al unirse)';
COMMENT ON COLUMN grupos_gacc.score_gacc IS
  'Media aritmética de score_reputacion de los miembros activos del grupo';
COMMENT ON COLUMN grupos_gacc.estado IS
  'Estado operativo: activo | restringido (penalización colectiva) | inactivo';

-- ---------------------------------------------------------------------------
-- 2. creditos — Referadora elegida por transacción (aval directo)
-- ---------------------------------------------------------------------------
ALTER TABLE creditos
  ADD COLUMN IF NOT EXISTS referadora_id uuid REFERENCES participantes (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_creditos_referadora_id ON creditos (referadora_id);

COMMENT ON COLUMN creditos.referadora_id IS
  'Miembro del mismo GACC elegido por el solicitante como aval directo (1/2)';

-- ---------------------------------------------------------------------------
-- 3. avales — Rol del aval dentro del circuito (referadora 1/2 | lider 2/2)
-- ---------------------------------------------------------------------------
ALTER TABLE avales
  ADD COLUMN IF NOT EXISTS rol_aval text CHECK (rol_aval IN ('referadora', 'lider'));

COMMENT ON COLUMN avales.rol_aval IS
  'Rol del aval en el circuito GACC: referadora (1/2) o lider (2/2)';

-- ---------------------------------------------------------------------------
-- 4. notificaciones — Ampliar tipos permitidos para el flujo GACC
-- ---------------------------------------------------------------------------
-- La tabla notificaciones (creada en 012) tenía un CHECK acotado a tipos de
-- referidos. Lo reemplazamos por una lista que conserva los antiguos y agrega
-- los del modelo GACC. No se recrea la tabla (sin DROP TABLE).
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo IN (
    -- Heredados (modelo referidos/redes — se conservan por compatibilidad)
    'bienvenida_red',
    'score_red_mejoro',
    'score_red_empeoro',
    'alerta_48h',
    'alerta_7d',
    'referido_nuevo',
    -- Nuevos (modelo GACC)
    'aval_requerido',         -- a la referadora: "Avalá a Juan"
    'aval_lider_requerido',   -- al líder social: falta tu aval 2/2
    'mora_referadora',        -- a la referadora del crédito en mora
    'mora_lider',             -- al líder social del GACC con mora
    'gacc_restringido'        -- al grupo: score bajo → restricciones
  ));
