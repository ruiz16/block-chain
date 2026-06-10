// =============================================================================
// POST /api/auth/refresh — Renovar token de acceso expirado
// =============================================================================
//
// Recibe un refresh_token de Supabase y lo canjea por un par nuevo
// (access_token + refresh_token). Esto permite al frontend renovar
// sesiones sin obligar al usuario a reconectar.
//
// Body: { refresh_token: string }
// Response: { access_token: string, refresh_token: string }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse body
    // ------------------------------------------------------------------
    const body: { refresh_token?: string } = await request.json().catch(() => ({}));
    const { refresh_token } = body;

    if (!refresh_token || typeof refresh_token !== 'string') {
      return NextResponse.json(
        { error: 'REFRESH_TOKEN_INVALIDO', detail: 'refresh_token es requerido' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Refresh session con la anon key
    // ------------------------------------------------------------------
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error('[auth/refresh] Faltan variables de entorno SUPABASE');
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error de configuración del servidor' },
        { status: 500 },
      );
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await anonClient.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      console.error('[auth/refresh] Error al refrescar sesión:', error?.message ?? 'session is null');
      return NextResponse.json(
        { error: 'REFRESH_FALLIDO', detail: error?.message ?? 'No se pudo renovar la sesión' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Return new tokens
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[auth/refresh] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
