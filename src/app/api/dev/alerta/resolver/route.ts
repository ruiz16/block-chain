// =============================================================================
// POST /api/dev/alerta/resolver — Restaurar estado previo (SIMULACIÓN, dev/demo)
// =============================================================================
//
// Contraparte de POST /api/dev/alerta. Recibe el SNAPSHOT que devolvió el
// disparo (guardado por el cliente) y restaura el estado original:
//   1. Cuota → estado y fecha_vencimiento previos.
//   2. participantes.score_reputacion → valor previo.
//   3. Recalcula score_gacc + penalización colectiva (vuelve a 'activo' si
//      supera el umbral).
//
// ⚠️ Sin guard de entorno — mismo criterio que /api/pago/simulado.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { recalcularScoreGacc } from '@/lib/gacc/semaforo';
import { z } from 'zod';
import type { DbEstadoCuota } from '@/types/supabase';

const ResolverSchema = z.object({
  cuota_id: z.string().uuid('cuota_id debe ser un UUID válido'),
  estado_anterior: z.string().min(1),
  fecha_vencimiento_anterior: z.string().min(1),
  score_anterior: z.number().min(0).max(100),
}).strict();

interface CuotaConCredito {
  id: string;
  credito: { id: string; prestatario_id: string } | null;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Validar body
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);
    const validation = ResolverSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: validation.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      );
    }

    const { cuota_id, estado_anterior, fecha_vencimiento_anterior, score_anterior } = validation.data;

    // ------------------------------------------------------------------
    // 2. Auth
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
    // 3. Participante
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
    // 4. Verificar propiedad de la cuota (vía crédito)
    // ------------------------------------------------------------------
    const { data: cuota } = await supabase
      .from('cuotas')
      .select('id, credito:credito_id ( id, prestatario_id )')
      .eq('id', cuota_id)
      .single();

    const typedCuota = cuota as CuotaConCredito | null;

    if (!typedCuota || typedCuota.credito?.prestatario_id !== participanteId) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'La cuota no existe o no te pertenece' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Restaurar cuota + score
    // ------------------------------------------------------------------
    await supabase
      .from('cuotas')
      .update({
        estado: estado_anterior as DbEstadoCuota,
        fecha_vencimiento: fecha_vencimiento_anterior,
      })
      .eq('id', cuota_id);

    await supabase
      .from('participantes')
      .update({ score_reputacion: score_anterior })
      .eq('id', participanteId);

    // ------------------------------------------------------------------
    // 6. Propagar al GACC
    // ------------------------------------------------------------------
    if (gaccId) {
      try {
        await recalcularScoreGacc(gaccId);
      } catch (err) {
        console.warn('[dev/alerta/resolver] Error al recalcular score_gacc:', err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ status: 'restaurado' }, { status: 200 });
  } catch (err) {
    console.error('[dev/alerta/resolver] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
