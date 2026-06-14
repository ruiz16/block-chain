// =============================================================================
// Auth Bearer Token Helper — for mobile/non-cookie clients
// =============================================================================
//
// Reads an Authorization: Bearer <token> header from the request, verifies
// the Supabase JWT, and returns the user + participante record.
//
// This lets mobile apps authenticate without browser cookies by sending
// the Supabase access_token obtained from POST /api/auth/siwe.
//
// Usage in any route handler:
//
//   const cookieUser = await getServerUser(cookieStore);
//   const bearerResult = !cookieUser ? await getBearerUser(request) : null;
//   const user = cookieUser ?? bearerResult?.user ?? null;
//   const participante = bearerResult?.participante ?? null;
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

/**
 * Supabase select string that matches BearerAuthResult['participante'].
 * Use this in every fallback `.select()` that assigns to typedParticipante.
 */
export const PARTICIPANTE_AUTH_SELECT =
  'id, gacc_id, validado_gacc, nombre, wallet_address, email' as const;

export interface BearerAuthResult {
  user: User;
  participante: {
    id: string;
    gacc_id: string | null;
    validado_gacc: boolean;
    nombre: string;
    wallet_address: string;
    email: string;
  } | null;
}

/**
 * Verify a Bearer token from the Authorization header and return the
 * Supabase user and their participante record.
 *
 * Returns null if no Authorization header is present or the token is invalid.
 */
export async function getBearerUser(
  request: Request,
): Promise<BearerAuthResult | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[getBearerUser] No Authorization header or not Bearer');
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    console.warn('[getBearerUser] Token is empty after Bearer prefix');
    return null;
  }

  const supabase = getSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error) {
    console.error('[getBearerUser] supabase.auth.getUser error:', error.message);
    return null;
  }

  if (!user) {
    console.warn('[getBearerUser] supabase.auth.getUser returned null user');
    return null;
  }

  // Look up participante by auth user_id (may not exist yet for new users)
  const { data: participante } = await supabase
    .from('participantes')
    .select(PARTICIPANTE_AUTH_SELECT)
    .eq('user_id', user.id)
    .single();

  return { user, participante: participante ?? null };
}
