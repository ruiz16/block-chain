-- =============================================================================
-- 012_referidos.sql — Tablas para SDD 03: Referidos y Redes de Apoyo
-- =============================================================================

-- 1. Código de referido para cada participante
ALTER TABLE participantes ADD COLUMN codigo_referido TEXT UNIQUE;

-- 2. Referidos
CREATE TABLE referidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referidor_id UUID NOT NULL REFERENCES participantes(id),
  referido_id UUID NOT NULL REFERENCES participantes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(referido_id)
);

-- 3. Redes de Apoyo
CREATE TABLE redes_apoyo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  score_red INTEGER NOT NULL DEFAULT 50,
  estado TEXT NOT NULL DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'rojo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Miembros de Red
CREATE TABLE red_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  red_id UUID NOT NULL REFERENCES redes_apoyo(id),
  participante_id UUID NOT NULL REFERENCES participantes(id),
  es_referidora BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participante_id)
);

-- 5. Notificaciones In-App
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

-- Index para listar notificaciones por usuario (más recientes primero)
CREATE INDEX idx_notificaciones_participante ON notificaciones(participante_id, created_at DESC);

-- 6. Cola de Email
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
