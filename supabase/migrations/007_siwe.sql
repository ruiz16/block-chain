-- =============================================================================
-- Migration 007: SIWE Authentication — Nonce Table + Password Column
-- =============================================================================
--
-- Adds the siwe_nonces table for EIP-4361 (Sign-In with Ethereum) flow,
-- plus an auth_password column on participantes for auto-generated passwords
-- used to create Supabase Auth sessions for wallet-based users.
--
-- Rollout order: After 006_loan_terms.sql, before any SIWE API code
--
-- Rollback:
--   DROP TABLE IF EXISTS siwe_nonces;
--   ALTER TABLE participantes DROP COLUMN IF EXISTS auth_password;
-- =============================================================================

-- 1. SIWE nonces table
--    Each nonce is single-use, expires after 10 minutes.
CREATE TABLE IF NOT EXISTS siwe_nonces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce           TEXT UNIQUE NOT NULL,
  wallet_address  TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_siwe_nonces_nonce ON siwe_nonces (nonce);
CREATE INDEX IF NOT EXISTS idx_siwe_nonces_wallet ON siwe_nonces (wallet_address);

-- 3. Auth password column on participantes
--    Stores the auto-generated password for SIWE wallet users so the
--    server can call signInWithPassword() to create a Supabase Auth session.
ALTER TABLE participantes
  ADD COLUMN IF NOT EXISTS auth_password TEXT;
