// =============================================================================
// PATCH /api/avales/{id}/revocar — Revocar Aval
// =============================================================================
//
// Flow:
// 1. Validate route param `id` as UUID (400 on failure)
// 2. Fetch aval with activo = true (404 if missing)
// 3. Fetch credit — reject if desembolsado/pagado/default (409)
// 4. SET aval.activo = false
// 5. COUNT remaining active avales for this credit
// 6. If count = 0, revert credit to 'pendiente'
// 7. Insert audit_log with 'aval_revocado'
// 8. Return 200
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireReviewer } from '@/lib/auth-guards';
import { RevocarAvalParamsSchema } from '@/lib/validations/avales';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------
interface AvalRowSimple {
  id: string;
  aval_id: string;
  prestatario_id: string;
  credito_id: string;
  monto_maximo: string;
  activo: boolean;
}

interface CreditoRowSimple {
  id: string;
  estado: string;
  prestatario_id: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: routeId } = await params;
    // ------------------------------------------------------------------
    // 0. Security guard: admin only
    // ------------------------------------------------------------------
    const auth = await requireReviewer(request);
    if (auth instanceof Response) return auth;

    // ------------------------------------------------------------------
    // 1. Validate route param
    // ------------------------------------------------------------------
    const paramValidation = RevocarAvalParamsSchema.safeParse({ id: routeId });

    if (!paramValidation.success) {
      return NextResponse.json(
        {
          error: 'ID_INVALIDO',
          detail: paramValidation.error.issues[0]?.message ?? 'ID de aval inválido',
        },
        { status: 400 },
      );
    }

    const { id } = paramValidation.data;
    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Fetch aval — must exist and be active
    // ------------------------------------------------------------------
    const { data: avalRow, error: avalError } = await supabase
      .from('avales')
      .select('id, aval_id, prestatario_id, credito_id, monto_maximo, activo')
      .eq('id', id)
      .single();

    if (avalError || !avalRow) {
      return NextResponse.json(
        { error: 'AVAL_NO_ENCONTRADO', detail: 'No se encontró el aval especificado' },
        { status: 404 },
      );
    }

    const aval = avalRow;

    if (!aval.activo) {
      return NextResponse.json(
        { error: 'AVAL_INACTIVO', detail: 'Este aval ya ha sido revocado previamente' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Fetch credit — reject if disbursed/repaid/default
    // ------------------------------------------------------------------
    const { data: creditoRow, error: creditoError } = await supabase
      .from('creditos')
      .select('id, estado, prestatario_id')
      .eq('id', aval.credito_id)
      .single();

    if (creditoError || !creditoRow) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito asociado al aval' },
        { status: 404 },
      );
    }

    const credito = creditoRow;

    if (credito.estado === 'desembolsado' || credito.estado === 'pagado' || credito.estado === 'default') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `No se puede revocar un aval de un crédito en estado "${credito.estado}"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 4. SET aval.activo = false
    // ------------------------------------------------------------------
    const { error: updateAvalError } = await supabase
      .from('avales')
      .update({ activo: false })
      .eq('id', aval.id);

    if (updateAvalError) {
      console.error('[avales-revocar] Error al desactivar aval:', updateAvalError.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al revocar el aval en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Count remaining active avales for this credit
    // ------------------------------------------------------------------
    const { count: activeCount, error: countError } = await supabase
      .from('avales')
      .select('id', { count: 'exact', head: true })
      .eq('credito_id', aval.credito_id)
      .eq('activo', true);

    if (countError) {
      console.warn(
        '[avales-revocar] Error al contar avales activos:',
        countError.message,
      );
    }

    const remaining = activeCount ?? 0;
    let nuevoEstadoCredito = credito.estado;

    // ------------------------------------------------------------------
    // 6. If count = 0, revert credit to 'pendiente'
    // ------------------------------------------------------------------
    if (remaining === 0) {
      const { error: updateCreditoError } = await supabase
        .from('creditos')
        .update({ estado: 'pendiente' })
        .eq('id', credito.id);

      if (updateCreditoError) {
        console.warn(
          '[avales-revocar] Error al revertir crédito a pendiente:',
          updateCreditoError.message,
          { credito_id: credito.id },
        );
      } else {
        nuevoEstadoCredito = 'pendiente';
      }
    }

    // ------------------------------------------------------------------
    // 7. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'aval_revocado',
      entidadTipo: 'credito',
      entidadId: credito.id,
      participanteId: aval.aval_id,
      detalles: {
        aval_id: aval.aval_id,
        credito_id: credito.id,
        aval_activos_restantes: remaining,
        credit_volvio_a_pendiente: remaining === 0,
      },
    });

    // ------------------------------------------------------------------
    // 8. Return success
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'revocado' as const,
        credito_estado: nuevoEstadoCredito,
        avales_activos_restantes: remaining,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[avales-revocar] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
