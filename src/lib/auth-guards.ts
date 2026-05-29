// =============================================================================
// Auth Guards — Role-based access control for API routes
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface ParticipanteRolRow {
  id: string;
  rol: string;
}

export interface AuthGuardSuccess {
  user: User;
  participante: { id: string; rol: string };
}

export type AuthGuardResult = AuthGuardSuccess | Response;

/**
 * Verifies that the request is from an authenticated user with one of the allowed roles.
 *
 * @param request - The incoming NextRequest
 * @param allowedRoles - Array of roles allowed to access the resource
 * @returns On success: { user, participante: { id, rol } }
 *          On failure: NextResponse with 401 or 403
 */
export async function requireRoles(
  request: NextRequest | Request,
  allowedRoles: string[],
): Promise<AuthGuardResult> {
  // getServerUser expects a CookieStore. NextRequest and Request have different ways to access cookies.
  // In Next.js App Router, we can use next/headers cookies() in server components,
  // but in route handlers we have the request object.
  
  let cookies;
  if ('cookies' in request) {
    cookies = request.cookies;
  } else {
    // For standard Request objects, we might need to parse headers or use next/headers
    // But route handlers usually get NextRequest.
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', detail: 'Tipo de solicitud no soportado para autenticación' },
      { status: 500 },
    );
  }

  const user = await getServerUser(cookies as any);

  if (!user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', detail: 'Debes iniciar sesión para acceder a este recurso' },
      { status: 401 },
    );
  }

  const supabase = getSupabaseClient();

  const { data: participante } = await supabase
    .from('participantes')
    .select('id, rol')
    .eq('user_id', user.id)
    .single();

  if (!participante || !allowedRoles.includes((participante as any).rol)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', detail: 'No tienes permisos suficientes para realizar esta acción' },
      { status: 403 },
    );
  }

  const typed = participante as unknown as ParticipanteRolRow;

  return {
    user,
    participante: { id: typed.id, rol: typed.rol },
  };
}

/**
 * Convenience wrapper for admin-only routes.
 */
export async function requireAdmin(request: NextRequest | Request): Promise<AuthGuardResult> {
  return requireRoles(request, ['admin']);
}

/**
 * Guard for routes accessible by anyone EXCEPT borrowers (prestatarios).
 * Usually for approval-related actions.
 */
export async function requireReviewer(request: NextRequest | Request): Promise<AuthGuardResult> {
  return requireRoles(request, ['admin']);
}
