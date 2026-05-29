// =============================================================================
// POST /api/pago — Register Payment API Route
// =============================================================================
//
// Flow:
// 1. Parse and validate body via Zod (400 on failure)
// 2. Verify session via auth-server (401 if no session)
// 3. Get participante by auth user_id (404 if not found)
// 4. Fetch credito by id + prestatario_id (404/409)
// 5. Check estado === 'desembolsado' / !== 'pagado' (409)
// 6. Check tx_hash_pago uniqueness (409 if duplicate)
// 7. Call verificarPago() for on-chain verification (422 on client err, 500 on RPC err)
// 8. UPDATE creditos: estado='pagado', tx_hash_pago, fecha_pago=NOW()
// 9. Return 200 { status: 'pagado', credito_id }
//
// NOTE: The existing DB trigger (audit_credito_estado_change) auto-records
//       'pago_recibido' in audit_log when estado changes to 'pagado'.
//       No manual audit insert is needed.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { PagoSchema } from '@/lib/validations/pago';
import { verificarPago } from '@/lib/blockchain/verificar-pago';
import { parseWeiFromDb } from '@/config/celo';
import type { PagoResponse } from '@/types/database';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface ParticipanteRow {
  id: string;
}

interface CreditoPagoRow {
  id: string;
  monto: string;
  estado: string;
  tx_hash_pago: string | null;
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

    const { credito_id, tx_hash } = validation.data;

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

    const typedParticipante = participante as unknown as ParticipanteRow | null;

    if (participanteError || !typedParticipante) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró un participante asociado a tu cuenta' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch credit by id + verify ownership
    // ------------------------------------------------------------------
    const { data: credito, error: creditoError } = await supabase
      .from('creditos')
      .select('id, monto, estado, tx_hash_pago')
      .eq('id', credito_id)
      .eq('prestatario_id', typedParticipante.id)
      .single();

    const typedCredito = credito as unknown as CreditoPagoRow | null;

    if (creditoError || !typedCredito) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check estado === 'desembolsado'
    // ------------------------------------------------------------------
    if (typedCredito.estado === 'pagado') {
      return NextResponse.json(
        {
          error: 'YA_PAGADO',
          detail: 'Este crédito ya fue pagado anteriormente',
        },
        { status: 409 },
      );
    }

    if (typedCredito.estado !== 'desembolsado') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${typedCredito.estado}", debe estar en "desembolsado"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Check tx_hash_pago uniqueness (already partially paid check)
    // ------------------------------------------------------------------
    if (typedCredito.tx_hash_pago) {
      return NextResponse.json(
        {
          error: 'YA_PAGADO',
          detail: 'Este crédito ya tiene un pago registrado',
        },
        { status: 409 },
      );
    }

    // Check that this tx_hash isn't already used for another credit
    const { data: existingPago } = await supabase
      .from('creditos')
      .select('id')
      .eq('tx_hash_pago', tx_hash)
      .maybeSingle();

    if (existingPago) {
      return NextResponse.json(
        {
          error: 'TX_HASH_DUPLICADO',
          detail: 'Este hash de transacción ya fue registrado para otro crédito',
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 7. On-chain verification via verificarPago()
    // ------------------------------------------------------------------
    const verification = await verificarPago(
      tx_hash as `0x${string}`,
      parseWeiFromDb(typedCredito.monto),
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
    // 8. Update credit record
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('creditos')
      .update({
        estado: 'pagado',
        tx_hash_pago: tx_hash,
        fecha_pago: new Date().toISOString(),
      } as never)
      .eq('id', typedCredito.id);

    if (updateError) {
      // Log but still return success — the blockchain tx already happened
      console.warn(
        '[pago] Error al actualizar crédito en DB después de verificación exitosa:',
        updateError.message,
        { credito_id: typedCredito.id, tx_hash },
      );
    }

    // ------------------------------------------------------------------
    // 9. Return success
    // ------------------------------------------------------------------
    const response: PagoResponse = {
      status: 'pagado',
      credito_id: typedCredito.id,
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
    TX_MONTO_INSUFICIENTE: 'El monto enviado es menor al crédito',
  };

  return messages[reason] ?? 'Error de verificación en la blockchain';
}
