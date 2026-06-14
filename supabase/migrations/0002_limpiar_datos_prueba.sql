-- =============================================================================
-- Migration 0002: Función de limpieza de datos de prueba
-- =============================================================================
-- Crea limpiar_datos_prueba(): borra TODOS los datos de prueba preservando
-- únicamente la(s) cuenta(s) administrador (participantes.rol = 'admin' y su
-- correspondiente auth.users — ej. admin@blockchain.com sembrado por
-- seed-users.mjs).
--
-- POR QUÉ UNA FUNCIÓN Y NO UN DELETE SUELTO:
--   - El RLS NO bloquea esto: las migraciones y el SQL Editor corren como
--     postgres/service_role, que ignora las políticas RLS. El RLS solo aplica a
--     los roles authenticated/anon (la app desde el navegador).
--   - El bloqueo real al borrar son las FK con ON DELETE RESTRICT
--     (creditos→participantes, avales→creditos, cuotas→creditos,
--      grupos_gacc.creador_id→participantes, etc.). Por eso hay que borrar en
--     ORDEN DE DEPENDENCIAS: hijos antes que padres.
--
-- USO (desde el SQL Editor de Supabase o psql con service_role):
--   SELECT limpiar_datos_prueba();
--
-- SEGURIDAD:
--   - SECURITY DEFINER: corre con privilegios del owner (puede tocar auth.users).
--   - Se REVOCA el EXECUTE a PUBLIC y solo se concede a service_role, para que
--     NINGÚN usuario autenticado de la app pueda invocarla por accidente.
-- =============================================================================

CREATE OR REPLACE FUNCTION limpiar_datos_prueba()
RETURNS void AS $$
DECLARE
  admin_user_ids uuid[];
BEGIN
  -- IDs de auth.users vinculados a una cuenta admin (a preservar)
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[])
    INTO admin_user_ids
    FROM participantes
   WHERE rol = 'admin' AND user_id IS NOT NULL;

  -- ---------------------------------------------------------------------------
  -- 1. Tablas que NO contienen datos del admin -> borrado completo
  --    (orden: hijos antes que padres por las FK RESTRICT)
  -- ---------------------------------------------------------------------------
  DELETE FROM audit_log;
  DELETE FROM siwe_nonces;
  DELETE FROM cola_email;
  DELETE FROM eventos_score;
  DELETE FROM push_subscriptions;
  DELETE FROM notificaciones;
  DELETE FROM cuotas;
  DELETE FROM avales;
  DELETE FROM gacc_miembros;
  DELETE FROM red_miembros;
  DELETE FROM redes_apoyo;
  DELETE FROM referidos;
  DELETE FROM progreso_educacion;
  DELETE FROM creditos;

  -- NOTA: modulos_educativos NO se toca — es SEED (contenido), no dato de prueba.

  -- ---------------------------------------------------------------------------
  -- 2. Grupos GACC
  --    gacc_miembros ya está vacío (CASCADE), y participantes.gacc_id se pone
  --    en NULL automáticamente (ON DELETE SET NULL).
  -- ---------------------------------------------------------------------------
  DELETE FROM grupos_gacc;

  -- ---------------------------------------------------------------------------
  -- 3. Participantes que NO son admin
  -- ---------------------------------------------------------------------------
  DELETE FROM participantes
   WHERE rol <> 'admin';

  -- ---------------------------------------------------------------------------
  -- 4. Usuarios de Auth que no son admin
  --    Cubre también auth.users huérfanos creados por tests fallidos.
  --    Guarda contra borrar todo si no hubiera ningún admin registrado.
  -- ---------------------------------------------------------------------------
  IF array_length(admin_user_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.users
     WHERE id <> ALL (admin_user_ids);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION limpiar_datos_prueba() IS
  'Borra todos los datos de prueba preservando las cuentas admin y los módulos educativos (seed). Invocar: SELECT limpiar_datos_prueba();';

-- Solo service_role puede ejecutarla (ningún usuario de la app)
REVOKE ALL ON FUNCTION limpiar_datos_prueba() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION limpiar_datos_prueba() TO service_role;
