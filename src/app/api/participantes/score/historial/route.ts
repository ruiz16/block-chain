// =============================================================================
// GET /api/participantes/score/historial — Historial de eventos de score
// =============================================================================
//
// Returns the last N score events for the authenticated user, along with
// the current effective score breakdown.
//
// Query params:
//   limit  — items per page (default: 20, max: 100)
//   offset — pagination offset (default: 0)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { HistorialScoreQuerySchema } from '@/lib/validations/score';
import { obtenerHistorialScore } from '@/lib/score/calculator';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse query params
    // ------------------------------------------------------------------
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const validation = HistorialScoreQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'PARAMETROS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Parámetros inválidos',
        },
        { status: 400 },
      );
    }

    const { limit, offset } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Get participante by auth user_id
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();

    const { data: rawParticipante } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawParticipante as unknown as { id: string } | null;

    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch historial
    // ------------------------------------------------------------------
    const historial = await obtenerHistorialScore(participante.id, limit, offset);

    // ------------------------------------------------------------------
    // 5. Return response
    // ------------------------------------------------------------------
    return NextResponse.json({ historial }, { status: 200 });
  } catch (err) {
    console.error('[score/historial] Error:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
