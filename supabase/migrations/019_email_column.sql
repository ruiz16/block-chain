-- =============================================================================
-- Migration 019: Add email column to participantes
-- =============================================================================
--
-- The email field was previously only stored in auth.users (via
-- admin.auth.admin.updateUserById), which corrupted the deterministic
-- wallet-based email and caused duplicate users on re-login.
--
-- Now we store the real email as a regular data column in the participantes
-- table, linked via user_id -> auth.users.id, leaving auth.users.email
-- untouched.
-- =============================================================================

ALTER TABLE participantes ADD COLUMN email TEXT NOT NULL DEFAULT '';
