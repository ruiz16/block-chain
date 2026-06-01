// =============================================================================
// POST /api/admin/recalcular-score — Recalcular scores (admin)
// =============================================================================
//
// Admin-only endpoint to recalcular seniority for all active participants
// or a specific one. Only inserts recalculo_manual events when the score
// actually changes.
//
// Body:
//   participante_id? — UUID of a specific participant (optional)
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { RecalcularScoreSchema } from '@/lib/validations/score';
import { recalcularTodosLosScores } from '@/lib/score/calculator';

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify admin session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    const { data: rawParticipante } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    const participante = rawParticipante as unknown as { rol: string } | null;

    if (!participante || participante.rol !== 'admin') {
      return NextResponse.json(
        { error: 'NO_AUTORIZADO', detail: 'Solo administradores pueden recalcular scores' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Parse body (optional)
    // ------------------------------------------------------------------
    let participanteId: string | undefined;

    try {
      const body = await request.json();
      const validation = RecalcularScoreSchema.safeParse(body);

      if (validation.success && validation.data.participante_id) {
        participanteId = validation.data.participante_id;
      }
    } catch {
      // Empty body is fine — recalcula todos
    }

    // ------------------------------------------------------------------
    // 3. Recalcular
    // ------------------------------------------------------------------
    const result = await recalcularTodosLosScores(participanteId);

    // ------------------------------------------------------------------
    // 4. Return
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'ok',
        procesados: result.procesados,
        detalle: participanteId
          ? `Score recalculado para ${result.procesados} participante(s)`
          : `Scores recalculados para ${result.procesados} participante(s)`,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/recalcular-score] Error:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
