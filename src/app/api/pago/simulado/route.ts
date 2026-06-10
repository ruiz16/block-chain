// =============================================================================
// POST /api/pago/simulado — Register Payment (Simulated, no on-chain tx)
// =============================================================================
//
// IDÉNTICO a POST /api/pago pero SIN verificación blockchain.
// Útil para mobile/testing donde no hay tx_hash real.
//
// Flow:
// 1. Parse and validate body via Zod (400 on failure)
// 2. Verify session (401 if no session)
// 3. Get participante by auth user_id (404 if not found)
// 4. Fetch cuota by cuota_id with credito info (404/409)
// 5. Check cuota estado === 'pendiente' (409 if already paid)
// 6. Check credito estado === 'desembolsado' (409 if not)
// 7. UPDATE cuota: estado='pagada', tx_hash_pago=simulado, fecha_pago=NOW()
// 8. If all cuotas are now paid → UPDATE credito: estado='pagado', fecha_pago=NOW()
// 9. Return 200 { status: 'pagado', cuota_id, credito_id }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { z } from 'zod';
import { recalcularScore } from '@/lib/score/calculator';
import { recalcularScoreRed } from '@/lib/referidos/score-red';
import { verificarAtrasosRed } from '@/lib/referidos/semaforo';
import type { PagoResponse } from '@/types/database';

// ---------------------------------------------------------------------------
// Validation — solo cuota_id, sin tx_hash
// ---------------------------------------------------------------------------

const PagoSimuladoSchema = z.object({
  cuota_id: z.string().uuid('cuota_id debe ser un UUID válido'),
}).strict();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CuotaConCredito {
  id: string;
  numero_cuota: number;
  monto_cuota: string;
  estado: string;
  fecha_vencimiento: string;
  credito: {
    id: string;
    estado: string;
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse and validate body
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = PagoSimuladoSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: validation.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      );
    }

    const { cuota_id } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para registrar un pago' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 3. Get participante by auth user_id
    // ------------------------------------------------------------------
    let typedParticipante: { id: string } | null = bearerResult?.participante ?? null;
    if (!typedParticipante) {
      const { data: participante } = await supabase
        .from('participantes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      typedParticipante = participante;
    }

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'No se encontró un participante asociado a tu cuenta' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch cuota by cuota_id + verify ownership via credito
    // ------------------------------------------------------------------
    const { data: cuota, error: cuotaError } = await supabase
      .from('cuotas')
      .select(`
        id,
        numero_cuota,
        monto_cuota,
        estado,
        fecha_vencimiento,
        credito:credito_id (
          id,
          estado
        )
      `)
      .eq('id', cuota_id)
      .single();

    const typedCuota = cuota as CuotaConCredito | null;

    if (cuotaError || !typedCuota) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'No se encontró la cuota especificada' },
        { status: 404 },
      );
    }

    // Verify this user owns the credit
    const creditoData = typedCuota.credito;

    if (!creditoData) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'La cuota no tiene un crédito asociado' },
        { status: 404 },
      );
    }

    const { data: creditoOwner } = await supabase
      .from('creditos')
      .select('prestatario_id')
      .eq('id', creditoData.id)
      .eq('prestatario_id', typedParticipante.id)
      .single();

    if (!creditoOwner) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'Este crédito no te pertenece' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check cuota estado === 'pendiente'
    // ------------------------------------------------------------------
    if (typedCuota.estado === 'pagada') {
      return NextResponse.json(
        { error: 'YA_PAGADA', detail: `La cuota #${typedCuota.numero_cuota} ya fue pagada anteriormente` },
        { status: 409 },
      );
    }

    if (typedCuota.estado !== 'pendiente') {
      return NextResponse.json(
        { error: 'ESTADO_INCORRECTO', detail: `La cuota está en estado "${typedCuota.estado}", debe estar en "pendiente"` },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Check credito estado === 'desembolsado'
    // ------------------------------------------------------------------
    if (creditoData.estado === 'pagado') {
      return NextResponse.json(
        { error: 'YA_PAGADO', detail: 'Este crédito ya fue pagado completamente' },
        { status: 409 },
      );
    }

    if (creditoData.estado !== 'desembolsado') {
      return NextResponse.json(
        { error: 'ESTADO_INCORRECTO', detail: `El crédito está en estado "${creditoData.estado}", debe estar en "desembolsado"` },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 7. Generar tx_hash simulado y actualizar cuota
    // ------------------------------------------------------------------
    const simulatedTxHash = `sim_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`;

    const { error: updateCuotaError } = await supabase
      .from('cuotas')
      .update({
        estado: 'pagada',
        tx_hash_pago: simulatedTxHash,
        fecha_pago: new Date().toISOString(),
      })
      .eq('id', typedCuota.id);

    if (updateCuotaError) {
      console.warn('[pago/simulado] Error al actualizar cuota:', updateCuotaError.message);
    }

    // ------------------------------------------------------------------
    // 7b. Recalcular score (pago puntual o atrasado)
    // ------------------------------------------------------------------
    const ahora = new Date();
    const fechaVencimiento = new Date(typedCuota.fecha_vencimiento);
    const esPuntual = ahora <= fechaVencimiento;

    recalcularScore({
      participanteId: typedParticipante.id,
      tipo: esPuntual ? 'pago_puntual' : 'pago_atrasado',
      referenciaTipo: 'cuota',
      referenciaId: typedCuota.id,
    }).catch((err) => {
      console.warn('[pago/simulado] Error al recalcular score:', err);
    });

    // ------------------------------------------------------------------
    // 7c. Recalcular score de red + verificar semáforo comunitario
    // ------------------------------------------------------------------
    recalcularScoreRed(typedParticipante.id).catch((err) => {
      console.warn('[pago/simulado] Error al recalcular score de red:', err);
    });

    verificarAtrasosRed(typedParticipante.id).catch((err) => {
      console.warn('[pago/simulado] Error al verificar atrasos de red:', err);
    });

    // ------------------------------------------------------------------
    // 8. Check if ALL cuotas are now paid → close the credit
    // ------------------------------------------------------------------
    const { data: pendingCuotas } = await supabase
      .from('cuotas')
      .select('id')
      .eq('credito_id', creditoData.id)
      .in('estado', ['pendiente', 'vencida']);

    const allPaid = !pendingCuotas || pendingCuotas.length === 0;

    if (allPaid) {
      const { error: updateCreditoError } = await supabase
        .from('creditos')
        .update({
          estado: 'pagado',
          fecha_pago: new Date().toISOString(),
        })
        .eq('id', creditoData.id);

      if (updateCreditoError) {
        console.warn('[pago/simulado] Error al marcar crédito como pagado:', updateCreditoError.message);
      }
    }

    // ------------------------------------------------------------------
    // 9. Return success
    // ------------------------------------------------------------------
    const response: PagoResponse = {
      status: 'pagado',
      cuota_id: typedCuota.id,
      credito_id: creditoData.id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[pago/simulado] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
