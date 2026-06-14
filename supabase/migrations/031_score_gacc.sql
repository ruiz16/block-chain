-- =============================================================================
-- Migration 031: Función de cálculo del Score Grupal (score_gacc)
-- =============================================================================
--
-- score_gacc = media aritmética de score_reputacion de los miembros activos
-- del grupo (Especificación GACC §4). Se invoca desde el backend vía RPC tras
-- cada evento de score individual y desde el endpoint admin de recálculo.
--
--   SELECT recalcular_score_gacc('<grupo-uuid>');
--
-- Rollback:
--   DROP FUNCTION IF EXISTS recalcular_score_gacc(uuid);
-- =============================================================================

CREATE OR REPLACE FUNCTION recalcular_score_gacc(grupo uuid)
RETURNS numeric AS $$
DECLARE
  nuevo_score numeric(5,2);
BEGIN
  -- Media de los miembros activos del grupo (pertenencia directa).
  -- Si el grupo no tiene miembros activos, el score queda en 0.
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
