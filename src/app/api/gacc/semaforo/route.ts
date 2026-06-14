// =============================================================================
// GET /api/gacc/semaforo — Semáforo de riesgo + score del GACC del usuario
// =============================================================================
//
// Devuelve el estado del semáforo de mora (verde/amarillo/rojo), el score grupal
// y el estado operativo del GACC al que pertenece el usuario autenticado.
// Solo lectura: NO genera notificaciones (las dispara el barrido admin / eventos).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser, PARTICIPANTE_AUTH_SELECT } from '@/lib/supabase/auth-bearer';
import { evaluarSemaforoGacc } from '@/lib/gacc/semaforo';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    let typedParticipante = bearerResult?.participante ?? null;
    if (!typedParticipante) {
      const { data } = await supabase
        .from('participantes')
        .select(PARTICIPANTE_AUTH_SELECT)
        .eq('user_id', user.id)
        .single();
      typedParticipante = data;
    }

    const gaccId = typedParticipante?.gacc_id ?? null;
    if (!gaccId) {
      return NextResponse.json(
        { error: 'SIN_GACC', detail: 'No perteneces a un GACC' },
        { status: 404 },
      );
    }

    // Datos del grupo (score + estado operativo + líder)
    const { data: rawGrupo } = await supabase
      .from('grupos_gacc')
      .select('id, nombre, score_gacc, estado, lider_id')
      .eq('id', gaccId)
      .single();

    const grupo = rawGrupo as unknown as {
      id: string;
      nombre: string;
      score_gacc: number | string;
      estado: string;
      lider_id: string | null;
    } | null;

    if (!grupo) {
      return NextResponse.json(
        { error: 'GACC_NO_ENCONTRADO', detail: 'No se encontró tu GACC' },
        { status: 404 },
      );
    }

    // Semáforo de mora (solo lectura)
    const semaforo = await evaluarSemaforoGacc(gaccId);

    return NextResponse.json(
      {
        grupo_id: grupo.id,
        nombre: grupo.nombre,
        score_gacc: Number(grupo.score_gacc ?? 0),
        estado: grupo.estado,
        semaforo: semaforo.estado,
        max_dias_mora: semaforo.maxDiasMora,
        cuotas_vencidas: semaforo.cuotasVencidas,
        creditos_en_mora: semaforo.creditosEnMora,
        es_lider: grupo.lider_id === (typedParticipante?.id ?? null),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[gacc/semaforo] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
