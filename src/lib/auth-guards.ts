// =============================================================================
// Auth Guards — Role-based access control for API routes
// =============================================================================
//
// Defense-in-depth strategy:
//   1. Middleware (src/middleware.ts) → UX layer, redirects to /login
//      Uses SSR client (cookie-based auth, RLS applies).
//   2. API Guards (this file) → Security boundary, returns 401/403 JSON
//      Uses service-role client (bypasses RLS for authoritative checks).
//
// The role query runs in both layers with DIFFERENT Supabase clients
// because they run in different contexts (edge vs server). This is
// intentional — not accidental duplication.
//
// Shared utilities:
//   getUserRoleByUserId() — extracted so both layers use the same query shape.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipanteRolRow {
  id: string;
  rol: string;
}

export interface AuthGuardSuccess {
  user: User;
  participante: { id: string; rol: string };
}

export type AuthGuardResult = AuthGuardSuccess | Response;

// ---------------------------------------------------------------------------
// Shared role query — single source of truth for the query shape
// ---------------------------------------------------------------------------

/**
 * Look up a participant's role by their auth user ID.
 *
 * Accepts any SupabaseClient so both the SSR client (middleware, RLS)
 * and the service-role client (API guards, authoritative) can use it.
 *
 * @returns { id, rol } or null if no participant row exists
 */
export async function getUserRoleByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; rol: string } | null> {
  const { data } = await supabase
    .from('participantes')
    .select('id, rol')
    .eq('user_id', userId)
    .single();

  return data as ParticipanteRolRow | null;
}

// ---------------------------------------------------------------------------
// Cookie extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract cookies from a request object.
 * NextRequest has `.cookies`; plain `Request` does not.
 * Route handlers receive NextRequest, so the `'cookies' in` check covers both.
 */
function getRequestCookies(request: NextRequest | Request): unknown {
  if ('cookies' in request && request.cookies) {
    return request.cookies;
  }

  throw new Error(
    'No se pudieron extraer cookies del request. ' +
      'Asegúrate de que el route handler recibe un NextRequest.',
  );
}

// ---------------------------------------------------------------------------
// Guards — return AuthGuardResult (AuthGuardSuccess | Response)
// ---------------------------------------------------------------------------

/**
 * Verify the user is authenticated AND has one of the allowed roles.
 *
 * @returns AuthGuardSuccess on success, NextResponse (401/403) on failure.
 */
export async function requireRoles(
  request: NextRequest | Request,
  allowedRoles: string[],
): Promise<AuthGuardResult> {
  let cookies: unknown;

  try {
    cookies = getRequestCookies(request);
  } catch {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', detail: 'Tipo de solicitud no soportado para autenticación' },
      { status: 500 },
    );
  }

  const user = await getServerUser(cookies as Parameters<typeof getServerUser>[0]);

  if (!user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', detail: 'Debes iniciar sesión para acceder a este recurso' },
      { status: 401 },
    );
  }

  const supabase = getSupabaseClient();
  const participante = await getUserRoleByUserId(supabase, user.id);

  if (!participante || !allowedRoles.includes(participante.rol)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', detail: 'No tienes permisos suficientes para realizar esta acción' },
      { status: 403 },
    );
  }

  return { user, participante: { id: participante.id, rol: participante.rol } };
}

/** Guard for admin-only routes (dashboard, admin panels). */
export async function requireAdmin(request: NextRequest | Request): Promise<AuthGuardResult> {
  return requireRoles(request, ['admin']);
}

/**
 * Guard for reviewer routes — only `admin` role is authorized.
 * (The `prestamista` and `aval` roles were removed from the app.)
 *
 * Used by:
 *   - GET  /api/creditos/pendientes — list credits for review
 *   - POST /api/desembolso          — disburse approved credits
 *   - PATCH /api/avales/{id}/revocar — revoke an aval
 */
export async function requireReviewer(request: NextRequest | Request): Promise<AuthGuardResult> {
  return requireRoles(request, ['admin']);
}
