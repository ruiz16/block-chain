// =============================================================================
// POST /api/pago — Register Payment for a Single Cuota
// =============================================================================
//
// Flow:
// 1. Parse and validate body via Zod (400 on failure)
// 2. Verify session via auth-server (401 if no session)
// 3. Get participante by auth user_id (404 if not found)
// 4. Fetch cuota by cuota_id with credito info (404/409)
// 5. Check cuota estado === 'pendiente' (409 if already paid)
// 6. Check credito estado === 'desembolsado' (409 if not)
// 7. Call verificarPago() with cuota.monto_cuota for on-chain verification
// 8. UPDATE cuota: estado='pagada', tx_hash_pago, fecha_pago=NOW()
// 9. If all cuotas are now paid → UPDATE credito: estado='pagado', fecha_pago=NOW()
// 10. Return 200 { status: 'pagado', cuota_id, credito_id }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { PagoSchema } from '@/lib/validations/pago';
import { verificarPago } from '@/lib/blockchain/verificar-pago';
import { parseCusd } from '@/config/celo';
import { recalcularScore } from '@/lib/score/calculator';
import { recalcularScoreRed } from '@/lib/referidos/score-red';
import { verificarAtrasosRed } from '@/lib/referidos/semaforo';
import type { PagoResponse } from '@/types/database';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface ParticipanteRow {
  id: string;
}

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
        {
          error: 'DATOS_INVALIDOS',
          detail: 'El cuerpo de la solicitud no es un JSON válido',
        },
        { status: 400 },
      );
    }

    const validation = PagoSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos inválidos',
        },
        { status: 400 },
      );
    }

    const { cuota_id, tx_hash } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

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
    const { data: participante, error: participanteError } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante;

    if (participanteError || !typedParticipante) {
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
    console.log('[pago] Estados recibidos:', {
      cuota_id: typedCuota.id,
      cuota_estado: typedCuota.estado,
      credito_id: creditoData.id,
      credito_estado: creditoData.estado,
    });

    if (typedCuota.estado === 'pagada') {
      console.warn('[pago] Cuota ya pagada:', { cuota_id: typedCuota.id, estado: typedCuota.estado });
      return NextResponse.json(
        {
          error: 'YA_PAGADA',
          detail: `La cuota #${typedCuota.numero_cuota} ya fue pagada anteriormente`,
        },
        { status: 409 },
      );
    }

    if (typedCuota.estado !== 'pendiente') {
      console.warn('[pago] Cuota en estado inválido:', { cuota_id: typedCuota.id, estado: typedCuota.estado });
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `La cuota está en estado "${typedCuota.estado}", debe estar en "pendiente"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Check credito estado === 'desembolsado'
    // ------------------------------------------------------------------
    if (creditoData.estado === 'pagado') {
      console.warn('[pago] Crédito ya pagado:', { credito_id: creditoData.id });
      return NextResponse.json(
        {
          error: 'YA_PAGADO',
          detail: 'Este crédito ya fue pagado completamente',
        },
        { status: 409 },
      );
    }

    if (creditoData.estado !== 'desembolsado') {
      console.warn('[pago] Crédito en estado inválido:', {
        credito_id: creditoData.id,
        estado: creditoData.estado,
      });
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${creditoData.estado}", debe estar en "desembolsado"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 7. Check tx_hash uniqueness (not used for another cuota)
    // ------------------------------------------------------------------
    const { data: existingCuota } = await supabase
      .from('cuotas')
      .select('id')
      .eq('tx_hash_pago', tx_hash)
      .maybeSingle();

    if (existingCuota) {
      return NextResponse.json(
        {
          error: 'TX_HASH_DUPLICADO',
          detail: 'Este hash de transacción ya fue registrado para otra cuota',
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 8. On-chain verification via verificarPago()
    //    Verify the amount sent is >= this cuota's amount
    // ------------------------------------------------------------------
    const montoCuota = parseCusd(typedCuota.monto_cuota);

    const verification = await verificarPago(
      tx_hash as `0x${string}`,
      montoCuota,
    );

    if (!verification.valid) {
      // RPC errors are server-side (timeout/network) → 500
      // All other verification failures are client-side → 422
      const status = verification.reason === 'RPC_ERROR' ? 500 : 422;

      return NextResponse.json(
        {
          error: verification.reason,
          detail: mapVerificationError(verification.reason),
        },
        { status },
      );
    }

    // ------------------------------------------------------------------
    // 9. Update cuota record
    // ------------------------------------------------------------------
    const { error: updateCuotaError } = await supabase
      .from('cuotas')
      .update({
        estado: 'pagada',
        tx_hash_pago: tx_hash,
        fecha_pago: new Date().toISOString(),
      })
      .eq('id', typedCuota.id);

    if (updateCuotaError) {
      console.warn(
        '[pago] Error al actualizar cuota en DB después de verificación exitosa:',
        updateCuotaError.message,
        { cuota_id: typedCuota.id, tx_hash },
      );
    }

    // ------------------------------------------------------------------
    // 9b. Recalcular score (pago puntual o atrasado)
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
      console.warn('[pago] Error al recalcular score (no bloqueante):', err);
    });

    // ------------------------------------------------------------------
    // 9c. Recalcular score de red + verificar semáforo comunitario
    // ------------------------------------------------------------------
    recalcularScoreRed(typedParticipante.id).catch((err) => {
      console.warn('[pago] Error al recalcular score de red:', err);
    });

    verificarAtrasosRed(typedParticipante.id).catch((err) => {
      console.warn('[pago] Error al verificar atrasos de red:', err);
    });

    // ------------------------------------------------------------------
    // 10. Check if ALL cuotas are now paid → close the credit
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
        console.warn(
          '[pago] Error al marcar crédito como pagado después de pagar todas las cuotas:',
          updateCreditoError.message,
          { credito_id: creditoData.id },
        );
      }
    }

    // ------------------------------------------------------------------
    // 11. Return success
    // ------------------------------------------------------------------
    const response: PagoResponse = {
      status: 'pagado',
      cuota_id: typedCuota.id,
      credito_id: creditoData.id,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    // ------------------------------------------------------------------
    // Unexpected error — catch-all
    // ------------------------------------------------------------------
    console.error('[pago] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}

// =============================================================================
// Error Message Mapping
// =============================================================================

/**
 * Maps a verification error code to a user-facing detail message.
 */
function mapVerificationError(reason: string): string {
  const messages: Record<string, string> = {
    TX_NO_ENCONTRADA: 'La transacción no existe en la blockchain',
    TX_REVERTIDA: 'La transacción fue revertida en la blockchain',
    TX_DESTINO_INVALIDO: 'La transacción no es al contrato de cUSD',
    TX_BENEFICIARIO_INVALIDO: 'El destinatario no es la wallet de la plataforma',
    TX_MONTO_INSUFICIENTE: 'El monto enviado es menor al valor de la cuota',
  };

  return messages[reason] ?? 'Error de verificación en la blockchain';
}
