-- =============================================================================
-- Migration 0003: Función para eliminar UN crédito y todas sus dependencias
-- =============================================================================
-- Crea eliminar_credito(p_credito_id uuid): borra un crédito específico junto a
-- todo lo que lo referencia, en ORDEN DE DEPENDENCIAS (hijos antes que el padre).
--
-- POR QUÉ EN ESTE ORDEN:
--   - cuotas y avales tienen FK ON DELETE RESTRICT → si no se borran primero,
--     el DELETE del crédito FALLA.
--   - audit_log.entidad_id y eventos_score.referencia_id NO son FK (uuid sueltos),
--     pero los limpiamos para no dejar referencias colgando a un crédito que ya
--     no existe.
--   - notificaciones NO referencia créditos → no se toca.
--
-- OJO: esto limpia la BASE DE DATOS, NO la blockchain. El crédito sigue
--      registrado on-chain en el LendingPool (inmutable). Para créditos de
--      prueba es inofensivo.
--
-- USO (SQL Editor de Supabase o psql con service_role):
--   -- 1. Verifica primero QUÉ vas a borrar:
--   SELECT id, estado, monto, tx_hash FROM creditos
--    WHERE tx_hash = '0x3e006a8ce01d4189aeab4fab3eab4ef67b0e4f8827c589a3b72f7d07e7b9d063';
--   -- 2. Ejecuta el borrado por id:
--   SELECT eliminar_credito('<uuid-del-credito>');
--   -- o en un solo paso, por el tx_hash del desembolso:
--   SELECT eliminar_credito(
--     (SELECT id FROM creditos
--       WHERE tx_hash = '0x3e006a8ce01d4189aeab4fab3eab4ef67b0e4f8827c589a3b72f7d07e7b9d063')
--   );
-- =============================================================================

CREATE OR REPLACE FUNCTION eliminar_credito(p_credito_id uuid)
RETURNS void AS $$
DECLARE
  v_cuota_ids uuid[];
BEGIN
  IF p_credito_id IS NULL THEN
    RAISE EXCEPTION 'eliminar_credito: p_credito_id es NULL (¿el tx_hash no coincidió con ningún crédito?)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM creditos WHERE id = p_credito_id) THEN
    RAISE NOTICE 'eliminar_credito: no existe crédito %; nada que borrar.', p_credito_id;
    RETURN;
  END IF;

  -- ids de las cuotas del crédito (para limpiar audit_log / eventos_score que las referencian)
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_cuota_ids
    FROM cuotas
   WHERE credito_id = p_credito_id;

  -- 1. audit_log: filas del crédito y de sus cuotas (entidad_id no es FK)
  DELETE FROM audit_log
   WHERE (entidad_tipo = 'credito' AND entidad_id = p_credito_id)
      OR (entidad_tipo = 'cuota'   AND entidad_id = ANY (v_cuota_ids));

  -- 2. eventos_score: referencias al crédito o a sus cuotas (referencia_id no es FK)
  DELETE FROM eventos_score
   WHERE (referencia_tipo = 'credito' AND referencia_id = p_credito_id)
      OR (referencia_tipo = 'cuota'   AND referencia_id = ANY (v_cuota_ids));

  -- 3. hijos con FK ON DELETE RESTRICT — deben ir ANTES que creditos
  DELETE FROM cuotas WHERE credito_id = p_credito_id;
  DELETE FROM avales WHERE credito_id = p_credito_id;

  -- 4. el crédito
  DELETE FROM creditos WHERE id = p_credito_id;

  RAISE NOTICE 'eliminar_credito: crédito % y sus dependencias borrados.', p_credito_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION eliminar_credito(uuid) IS
  'Borra un crédito y todas sus dependencias (cuotas, avales, audit_log, eventos_score) en orden de FK. NO afecta la blockchain. Invocar como service_role.';

-- Solo service_role puede ejecutarla (ningún usuario de la app)
REVOKE ALL ON FUNCTION eliminar_credito(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eliminar_credito(uuid) TO service_role;
