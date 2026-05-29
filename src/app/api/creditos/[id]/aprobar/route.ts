// =============================================================================
// PATCH /api/creditos/{id}/aprobar — Approve Credit
// =============================================================================
//
// Admin-only endpoint. Transitions a credit from 'pendiente' or 'avalado'
// to 'aprobado' and sets the fecha_vencimiento.
//
// Flow:
// 1. requireAdmin() guard — 401/403 if not authenticated or not admin
// 2. Fetch credit by route param id — 404 if missing
// 3. Validate estado IN ('pendiente', 'avalado') — 409 if not
// 4. UPDATE estado='aprobado', fecha_vencimiento = NOW() + plazo_dias
// 5. Insert audit_log with 'credito_aprobado'
// 6. Return 200 with { status: 'aprobado', credito_id }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface CreditoRowSimple {
  id: string;
  estado: string;
  plazo_dias: number;
  prestatario_id: string;
  monto: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    // ------------------------------------------------------------------
    // 1. requireAdmin() guard
    // ------------------------------------------------------------------
    const auth = await requireAdmin(request);

    // If auth is a Response, it means the guard failed (401/403)
    if (auth instanceof Response) {
      return auth;
    }

    const { participante } = auth;

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Fetch credit by id
    // ------------------------------------------------------------------
    const { data: creditoRow, error: creditoError } = await supabase
      .from('creditos')
      .select('id, estado, plazo_dias, prestatario_id, monto')
      .eq('id', id)
      .single();

    if (creditoError || !creditoRow) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    const credito = creditoRow as unknown as CreditoRowSimple;

    // ------------------------------------------------------------------
    // 3. Validate estado IN ('pendiente', 'avalado')
    // ------------------------------------------------------------------
    if (credito.estado !== 'pendiente' && credito.estado !== 'avalado') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${credito.estado}", debe estar en "pendiente" o "avalado"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 4. UPDATE estado='aprobado', fecha_vencimiento = NOW() + plazo_dias
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('creditos')
      .update({
        estado: 'aprobado',
        fecha_vencimiento: new Date(
          Date.now() + credito.plazo_dias * 24 * 60 * 60 * 1000,
        ).toISOString(),
      } as never)
      .eq('id', credito.id);

    if (updateError) {
      console.error('[creditos-aprobar] Error al actualizar crédito:', updateError.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al aprobar el crédito en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'credito_aprobado',
      entidadTipo: 'credito',
      entidadId: credito.id,
      participanteId: participante.id,
      detalles: {
        credito_id: credito.id,
        estado_anterior: credito.estado,
        estado_nuevo: 'aprobado',
        plazo_dias: credito.plazo_dias,
        monto: credito.monto,
        admin_id: participante.id,
      },
    });

    // ------------------------------------------------------------------
    // 6. Return 200
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'aprobado' as const,
        credito_id: credito.id,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[creditos-aprobar] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
