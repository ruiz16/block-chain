-- =============================================================================
-- Migration 006: Loan Terms — interest %, duration days, due date
-- =============================================================================
--
-- Adds interest percentage, duration in days, and computed due date to the
-- creditos table. These fields enable the platform to track loan terms per
-- credit rather than using a fixed global rate.
--
-- Rollback:
--   ALTER TABLE creditos DROP COLUMN interes_porcentaje;
--   ALTER TABLE creditos DROP COLUMN plazo_dias;
--   ALTER TABLE creditos DROP COLUMN fecha_vencimiento;
-- =============================================================================

ALTER TABLE creditos ADD COLUMN IF NOT EXISTS interes_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS plazo_dias INTEGER NOT NULL DEFAULT 30;
ALTER TABLE creditos ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ;
