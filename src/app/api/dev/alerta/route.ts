// =============================================================================
// POST /api/dev/alerta — Disparar alerta de nodo (SIMULACIÓN, solo dev/demo)
// =============================================================================
//
// Reemplaza la antigua simulación por estado local del móvil (Dev.tsx). Muta
// datos REALES del usuario autenticado para que el semáforo del GACC, el score
// y el crédito reflejen una mora:
//   1. Toma una cuota NO pagada del crédito desembolsado del usuario.
//   2. La marca 'vencida' y retrasa su fecha_vencimiento 8 días (> 7 = ROJO).
//   3. Degrada participantes.score_reputacion en 15 puntos.
//   4. Recalcula score_gacc + penalización colectiva del grupo.
//
// Devuelve un SNAPSHOT con los valores previos. El cliente (Dev.tsx) lo guarda
// y lo reenvía a POST /api/dev/alerta/resolver para restaurar el estado.
//
// ⚠️ NO tiene guard de entorno — replica el patrón de /api/pago/simulado, que
//    tampoco lo tiene. Solo se protege por auth Bearer + propiedad del crédito.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { recalcularScoreGacc } from '@/lib/gacc/semaforo';

// > DIAS_MORA_ROJO (7) en lib/gacc/semaforo → fuerza semáforo 'rojo'.
const DIAS_MORA_SIMULADA = 8;
// Penalización aplicada a score_reputacion (mismo orden que el evento 'default').
const PENALIZACION_SCORE = 15;

export interface AlertaSnapshot {
  cuota_id: string;
  estado_anterior: string;
  fecha_vencimiento_anterior: string;
  score_anterior: number;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Auth (cookies → Bearer fallback para móvil)
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // 2. Participante (id + gacc_id)
    // ------------------------------------------------------------------
    let participanteId = bearerResult?.participante?.id ?? null;
    let gaccId = bearerResult?.participante?.gacc_id ?? null;

    if (!participanteId) {
      const { data } = await supabase
        .from('participantes')
        .select('id, gacc_id')
        .eq('user_id', user.id)
        .single();
      participanteId = data?.id ?? null;
      gaccId = data?.gacc_id ?? null;
    }

    if (!participanteId) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No se encontró un participante asociado a tu cuenta' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Score actual (para el snapshot)
    // ------------------------------------------------------------------
    const { data: scoreRow } = await supabase
      .from('participantes')
      .select('score_reputacion')
      .eq('id', participanteId)
      .single();

    const scoreAnterior = Number(scoreRow?.score_reputacion ?? 0);

    // ------------------------------------------------------------------
    // 4. Crédito desembolsado del usuario
    // ------------------------------------------------------------------
    const { data: creditos } = await supabase
      .from('creditos')
      .select('id')
      .eq('prestatario_id', participanteId)
      .eq('estado', 'desembolsado');

    const creditoIds = (creditos ?? []).map((c: { id: string }) => c.id);

    if (creditoIds.length === 0) {
      return NextResponse.json(
        { error: 'SIN_CREDITO_ACTIVO', detail: 'No tienes un crédito desembolsado para simular una mora' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Cuota NO pagada (la primera por número de cuota)
    // ------------------------------------------------------------------
    const { data: cuota } = await supabase
      .from('cuotas')
      .select('id, estado, fecha_vencimiento')
      .in('credito_id', creditoIds)
      .neq('estado', 'pagada')
      .order('numero_cuota', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!cuota) {
      return NextResponse.json(
        { error: 'SIN_CUOTA_PENDIENTE', detail: 'No tienes cuotas pendientes para simular una mora' },
        { status: 409 },
      );
    }

    const snapshot: AlertaSnapshot = {
      cuota_id: cuota.id as string,
      estado_anterior: cuota.estado as string,
      fecha_vencimiento_anterior: cuota.fecha_vencimiento as string,
      score_anterior: scoreAnterior,
    };

    // ------------------------------------------------------------------
    // 6. Mutar: cuota vencida (fecha atrasada) + score degradado
    // ------------------------------------------------------------------
    const vencimientoSimulado = new Date();
    vencimientoSimulado.setDate(vencimientoSimulado.getDate() - DIAS_MORA_SIMULADA);

    await supabase
      .from('cuotas')
      .update({
        estado: 'vencida',
        fecha_vencimiento: vencimientoSimulado.toISOString(),
      })
      .eq('id', cuota.id);

    const scoreNuevo = Math.max(0, scoreAnterior - PENALIZACION_SCORE);
    await supabase
      .from('participantes')
      .update({ score_reputacion: scoreNuevo })
      .eq('id', participanteId);

    // ------------------------------------------------------------------
    // 7. Propagar al GACC (score grupal + penalización colectiva)
    // ------------------------------------------------------------------
    if (gaccId) {
      try {
        await recalcularScoreGacc(gaccId);
      } catch (err) {
        console.warn('[dev/alerta] Error al recalcular score_gacc:', err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ status: 'alerta_activa', snapshot }, { status: 200 });
  } catch (err) {
    console.error('[dev/alerta] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
