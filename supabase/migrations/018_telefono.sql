-- =============================================================================
-- Migration 018: Add telefono column to participantes
-- =============================================================================
--
-- Adds a phone number field to each participant so the system can contact
-- the user via WhatsApp or Telegram for community notifications, alerts,
-- and restore-node coordination.
--
-- The field is text (not numeric) to support international formats like
-- +57 310 123 4567 without losing leading zeros or country codes.
-- =============================================================================

ALTER TABLE participantes
  ADD COLUMN telefono text NOT NULL DEFAULT '';

COMMENT ON COLUMN participantes.telefono IS
  'Número de celular del participante, formato libre (+57 310...)';
