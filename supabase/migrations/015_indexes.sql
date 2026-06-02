-- =============================================================================
-- Migration 015: Missing FK Indexes
-- =============================================================================
--
-- Adds indexes on foreign key columns that are frequently queried but
-- were not indexed in previous migrations.
--
-- Why?
--   Postgres does NOT automatically index foreign key columns. Without an
--   index, a DELETE or UPDATE on the parent table triggers a sequential
--   scan of the child table to enforce referential integrity, and lookups
--   by FK are equally slow.
--
-- Previously indexed (migrations 001-014):
--   creditos(prestatario_id), avales(credito_id), cuotas(credito_id),
--   gacc_miembros(grupo_id, participante_id), participantes(user_id),
--   notificaciones(participante_id), eventos_score(participante_id)
--
-- Added in this migration:
--   avales(aval_id)               — FK to participantes, frequently joined
--   audit_log(participante_id)    — FK to participantes, filtered by participant
--   audit_log(entidad_id)         — frequently filtered by entity
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_avales_aval_id
  ON avales (aval_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_participante_id
  ON audit_log (participante_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_entidad_id
  ON audit_log (entidad_id);
