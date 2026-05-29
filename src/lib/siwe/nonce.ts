// =============================================================================
// SIWE Nonce Utilities — Generate, Verify, Cleanup
// =============================================================================
//
// DB-backed nonces for EIP-4361 (Sign-In with Ethereum). Nonces are stored
// in the `siwe_nonces` table with a 10-minute TTL and consumed on first use.
//
// All operations use the Supabase admin client (service_role key) because
// the nonce API is called BEFORE authentication — there is no auth session
// to enforce RLS.
// =============================================================================

import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Admin client (service_role) — used server-side only, never exposed to client
// ---------------------------------------------------------------------------
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL en las variables de entorno.');
  }
  if (!serviceKey) {
    throw new Error('Falta SUPABASE_SERVICE_KEY en las variables de entorno.');
  }

  return createClient(supabaseUrl, serviceKey);
}

// ---------------------------------------------------------------------------
// generateNonce
// ---------------------------------------------------------------------------
// Creates a random 16-byte hex nonce, inserts it into `siwe_nonces` with a
// 10-minute TTL, and returns the nonce string and expiration timestamp.
//
// @param walletAddress - The wallet address requesting the nonce
// @returns { nonce, expires_at } — the nonce value and ISO expiration
// ---------------------------------------------------------------------------
export async function generateNonce(
  walletAddress: string,
): Promise<{ nonce: string; expires_at: string }> {
  const admin = getAdminClient();

  // Generate a cryptographically random nonce
  const nonce = randomBytes(16).toString('hex');

  // TTL: 10 minutes from now
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await admin.from('siwe_nonces').insert({
    nonce,
    wallet_address: walletAddress,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Error al guardar nonce: ${error.message}`);
  }

  return { nonce, expires_at: expiresAt };
}

// ---------------------------------------------------------------------------
// verifyAndConsumeNonce
// ---------------------------------------------------------------------------
// Checks that the nonce exists, belongs to the given wallet, and hasn't
// expired. If valid, deletes the nonce (single-use) and returns true.
//
// Also performs application-level cleanup of expired nonces.
//
// @param nonce         - The nonce string to verify and consume
// @param walletAddress - The wallet address that owns the nonce
// @returns boolean — true if nonce was valid and consumed
// ---------------------------------------------------------------------------
export async function verifyAndConsumeNonce(
  nonce: string,
  walletAddress: string,
): Promise<boolean> {
  const admin = getAdminClient();

  // Clean expired nonces first
  await admin.from('siwe_nonces').delete().lt('expires_at', new Date().toISOString());

  // Look up the specific nonce for this wallet
  const { data, error } = await admin
    .from('siwe_nonces')
    .select('id, expires_at')
    .eq('nonce', nonce)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  // Check expiration (belt-and-suspenders with the DB cleanup above)
  if (new Date(data.expires_at) < new Date()) {
    // Clean up this specific expired row
    await admin.from('siwe_nonces').delete().eq('id', data.id);
    return false;
  }

  // Delete the nonce — single-use consumption
  await admin.from('siwe_nonces').delete().eq('id', data.id);

  return true;
}

// ---------------------------------------------------------------------------
// getCleanupExpired
// ---------------------------------------------------------------------------
// Removes ALL rows from siwe_nonces where expires_at is in the past.
// Safe to call periodically or on every SIWE login attempt.
// ---------------------------------------------------------------------------
export async function getCleanupExpired(): Promise<void> {
  const admin = getAdminClient();

  const { error } = await admin
    .from('siwe_nonces')
    .delete()
    .lt('expires_at', new Date().toISOString());

  if (error) {
    console.error('Error limpiando nonces expirados:', error.message);
  }
}
