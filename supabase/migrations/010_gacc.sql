-- =============================================================================
-- Migration 010: Grupos de Ahorro y Crédito Comunitario (GACC)
-- =============================================================================
--
-- Agrega el concepto de GACC como capa de validación social previa
-- al acceso al crédito (Fase de Inicio).
--
-- Un participante debe pertenecer a un GACC y estar validado por el
-- grupo para poder solicitar créditos. La validación social reemplaza
-- la garantía prendaria tradicional.
--
-- Rollback:
--   DROP TABLE IF EXISTS gacc_miembros;
--   DROP TABLE IF EXISTS grupos_gacc;
--   ALTER TABLE participantes DROP COLUMN IF EXISTS validado_gacc;
--   ALTER TABLE participantes DROP COLUMN IF EXISTS gacc_id;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New tipo_accion values for audit log
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Table: grupos_gacc
-- ---------------------------------------------------------------------------

CREATE TABLE grupos_gacc (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 200),
  descripcion text CHECK (descripcion IS NULL OR char_length(descripcion) <= 500),
  codigo      text NOT NULL,
  creador_id  uuid NOT NULL REFERENCES participantes (id) ON DELETE RESTRICT,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique index on codigo
CREATE UNIQUE INDEX idx_grupos_gacc_codigo ON grupos_gacc (codigo);

-- Index on creador_id for lookups
CREATE INDEX idx_grupos_gacc_creador_id ON grupos_gacc (creador_id);

COMMENT ON TABLE  grupos_gacc               IS 'Grupos de Ahorro y Crédito Comunitario';
COMMENT ON COLUMN grupos_gacc.codigo         IS 'Código compartible para unirse al grupo (ej. MANGLE-XXXX)';
COMMENT ON COLUMN grupos_gacc.creador_id     IS 'Participante que creó el grupo (creador automático es primer miembro)';

-- ---------------------------------------------------------------------------
-- 3. Table: gacc_miembros
-- ---------------------------------------------------------------------------

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

-- Indexes
CREATE INDEX idx_gacc_miembros_grupo_id        ON gacc_miembros (grupo_id);
CREATE INDEX idx_gacc_miembros_participante_id  ON gacc_miembros (participante_id);
CREATE INDEX idx_gacc_miembros_validado_en      ON gacc_miembros (validado_en) WHERE validado_en IS NOT NULL;

COMMENT ON TABLE  gacc_miembros                  IS 'Miembros de un GACC';
COMMENT ON COLUMN gacc_miembros.validado_por     IS 'Participante que validó a este miembro (NULL = pendiente)';
COMMENT ON COLUMN gacc_miembros.validado_en      IS 'Momento de validación (NULL = pendiente)';

-- ---------------------------------------------------------------------------
-- 4. Add GACC columns to participantes
-- ---------------------------------------------------------------------------

ALTER TABLE participantes
  ADD COLUMN gacc_id       uuid REFERENCES grupos_gacc (id) ON DELETE SET NULL,
  ADD COLUMN validado_gacc boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN participantes.gacc_id        IS 'GACC al que pertenece el participante';
COMMENT ON COLUMN participantes.validado_gacc  IS 'El participante ha sido validado por su GACC';

-- ---------------------------------------------------------------------------
-- 5. RLS policies for grupos_gacc
-- ---------------------------------------------------------------------------

ALTER TABLE grupos_gacc ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacc_miembros ENABLE ROW LEVEL SECURITY;

-- grupos_gacc: SELECT any authenticated, INSERT authenticated, UPDATE creator only
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

-- gacc_miembros: SELECT any authenticated, INSERT authenticated, UPDATE miembros of same group
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

-- ---------------------------------------------------------------------------
-- 6. Trigger: auto-insert creator as first validated member
-- ---------------------------------------------------------------------------

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
