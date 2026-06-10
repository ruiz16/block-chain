-- =============================================================================
-- Education Module — Content & Participant Progress
-- =============================================================================
--
-- Tables:
--   modulos_educativos   → lesson content (steps)
--   progreso_educacion   → per-participant progress
--
-- Seed: 4 initial modules matching the original EDU_CONVERSATION
-- =============================================================================

-- =============================================================================
-- 1. modulos_educativos — lesson/module content
-- =============================================================================

CREATE TABLE IF NOT EXISTS modulos_educativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden INTEGER NOT NULL CHECK (orden > 0),
  sender TEXT NOT NULL CHECK (sender IN ('system', 'whatsapp_fld')),
  mensaje TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_modulos_orden ON modulos_educativos (orden);

COMMENT ON TABLE modulos_educativos IS 'Módulos educativos del programa de formación MANGLE';
COMMENT ON COLUMN modulos_educativos.orden IS 'Orden del paso en la conversación (1, 2, 3...)';
COMMENT ON COLUMN modulos_educativos.sender IS 'Quién envía el mensaje: system (nota del sistema) o whatsapp_fld (chat FLD)';

-- =============================================================================
-- 2. Seed — 4 módulos iniciales (desde EDU_CONVERSATION original)
-- =============================================================================

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
  )
ON CONFLICT (orden) DO NOTHING;

-- =============================================================================
-- 3. progreso_educacion — per-participant progress
-- =============================================================================

CREATE TABLE IF NOT EXISTS progreso_educacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id UUID NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  modulo_actual INTEGER NOT NULL DEFAULT 1,
  completado BOOLEAN NOT NULL DEFAULT false,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progreso_educacion_participante_unique UNIQUE (participante_id)
);

CREATE INDEX IF NOT EXISTS idx_progreso_participante ON progreso_educacion (participante_id);

COMMENT ON TABLE progreso_educacion IS 'Progreso educativo por participante';
COMMENT ON COLUMN progreso_educacion.modulo_actual IS 'Paso actual del participante (1‑based)';
COMMENT ON COLUMN progreso_educacion.completado IS 'Si el participante completó todo el módulo formativo';
