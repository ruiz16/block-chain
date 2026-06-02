-- =============================================================================
-- 013_rls_score_referidos.sql — RLS para migrations 011 y 012
-- =============================================================================
--
-- Las tablas creadas en 011_score_dinamico.sql y 012_referidos.sql no tenían
-- RLS. Esta migration las agrega siguiendo el patrón de 001_schema.sql.
--
-- Como la app usa service-role client para todas las operaciones (getSupabaseClient),
-- RLS es defensa-en-profundidad contra acceso directo a la base de datos.
--
-- Rollback:
--   DROP POLICY IF EXISTS ... ON cada tabla;
--   ALTER TABLE ... DISABLE ROW LEVEL SECURITY;
-- =============================================================================

-- =============================================================================
-- 1. eventos_score (migration 011)
-- =============================================================================
ALTER TABLE eventos_score ENABLE ROW LEVEL SECURITY;

-- Usuarias ven sus propios eventos de score
CREATE POLICY "eventos_score_select_own"
  ON eventos_score FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

-- Solo service_role puede insertar eventos (score calculation es server-side)
CREATE POLICY "eventos_score_insert_service_role"
  ON eventos_score FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================================================================
-- 2. referidos (migration 012)
-- =============================================================================
ALTER TABLE referidos ENABLE ROW LEVEL SECURITY;

-- Usuarias ven referidos donde son referidor o referida
CREATE POLICY "referidos_select_own"
  ON referidos FOR SELECT
  TO authenticated
  USING (referidor_id = auth.uid() OR referido_id = auth.uid());

-- Solo service_role puede insertar (registro vía API server-side)
CREATE POLICY "referidos_insert_service_role"
  ON referidos FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "referidos_update_service_role"
  ON referidos FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 3. redes_apoyo (migration 012)
-- =============================================================================
ALTER TABLE redes_apoyo ENABLE ROW LEVEL SECURITY;

-- Usuarias ven redes a las que pertenecen (via red_miembros)
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

-- Solo service_role puede insertar/actualizar
CREATE POLICY "redes_apoyo_insert_service_role"
  ON redes_apoyo FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "redes_apoyo_update_service_role"
  ON redes_apoyo FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 4. red_miembros (migration 012)
-- =============================================================================
ALTER TABLE red_miembros ENABLE ROW LEVEL SECURITY;

-- Usuarias ven su propia membresía
CREATE POLICY "red_miembros_select_own"
  ON red_miembros FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

-- Solo service_role puede insertar/actualizar
CREATE POLICY "red_miembros_insert_service_role"
  ON red_miembros FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "red_miembros_update_service_role"
  ON red_miembros FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. notificaciones (migration 012)
-- =============================================================================
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Usuarias ven y actualizan sus propias notificaciones
CREATE POLICY "notificaciones_select_own"
  ON notificaciones FOR SELECT
  TO authenticated
  USING (participante_id = auth.uid());

CREATE POLICY "notificaciones_update_own"
  ON notificaciones FOR UPDATE
  TO authenticated
  USING (participante_id = auth.uid())
  WITH CHECK (participante_id = auth.uid());

-- Solo service_role puede insertar notificaciones
CREATE POLICY "notificaciones_insert_service_role"
  ON notificaciones FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================================================================
-- 6. cola_email (migration 012)
-- =============================================================================
ALTER TABLE cola_email ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede tocar la cola de emails
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
