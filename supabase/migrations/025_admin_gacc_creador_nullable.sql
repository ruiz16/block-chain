-- =============================================================================
-- Migration 025: Make creador_id nullable in grupos_gacc
-- =============================================================================
--
-- Why: Admin creates GACCs without belonging to them. Setting creador_id = null
-- skips the auto-add-member trigger, avoiding the insert-then-delete rodeo.
-- =============================================================================

-- 1. Make creador_id nullable
ALTER TABLE grupos_gacc ALTER COLUMN creador_id DROP NOT NULL;

-- 2. Drop old trigger & function
DROP TRIGGER IF EXISTS trg_gacc_auto_add_creator ON grupos_gacc;
DROP FUNCTION IF EXISTS gacc_auto_add_creator();

-- 3. Recreate function with null check (only auto-adds if creador_id is set)
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

-- 4. Recreate trigger
CREATE TRIGGER trg_gacc_auto_add_creator
  AFTER INSERT ON grupos_gacc
  FOR EACH ROW
  EXECUTE FUNCTION gacc_auto_add_creator();

-- Note: The existing RLS policy "grupos_gacc_update_creator" uses:
--   creador_id IN (SELECT id FROM participantes WHERE user_id = auth.uid())
-- NULL IN (subquery) returns NULL (falsy), so regular users cannot UPDATE
-- admin-created GACCs via RLS. The admin endpoint uses service-role, so it
-- bypasses RLS entirely. No policy changes needed.
