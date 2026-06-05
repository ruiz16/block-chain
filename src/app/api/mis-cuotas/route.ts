// =============================================================================
// GET /api/mis-cuotas — List Cuotas for Authenticated User
// =============================================================================
//
// Returns all cuotas for the user's credits. The response groups cuotas by
// credit, making it easy for the frontend to render PanelPagos.
//
// Auth flow:
// 1. Read session cookie via getServerUser()
// 2. Look up participante row by auth user_id
// 3. Fetch user's credit IDs
// 4. Fetch all cuotas for those credits with credit info
// 5. Return { cuotas: EnrichedCuota[] }
//
// NOTE: Credits with only 1 cuota DO appear here — single-payment credits
// are effectively 1-cuota credits.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------
interface ParticipanteRow {
  id: string;
}

export interface EnrichedCuota {
  id: string;
  credito_id: string;
  credito_monto: string;     // COPm total (human-readable, COPm = COP 1:1)
  credito_estado: string;
  credito_descripcion: string | null;
  numero_cuota: number;
  total_cuotas: number;
  monto_capital: string;  // COPm wei
  monto_interes: string;  // COPm wei
  monto_cuota: string;    // COPm wei
  saldo_restante: string; // COPm wei
  fecha_vencimiento: string;
  estado: 'pendiente' | 'pagada' | 'vencida';
  tx_hash_pago: string | null;
  fecha_pago: string | null;
}

export async function GET(): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para ver tus cuotas' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id
    // ------------------------------------------------------------------
    const { data: participante } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante;

    if (!typedParticipante) {
      return NextResponse.json({ cuotas: [] }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Fetch user's credit IDs
    // ------------------------------------------------------------------
    const { data: creditos } = await supabase
      .from('creditos')
      .select('id, monto, estado, descripcion, numero_cuotas')
      .eq('prestatario_id', typedParticipante.id)
      .order('fecha_solicitud', { ascending: false });

    if (!creditos || creditos.length === 0) {
      return NextResponse.json({ cuotas: [] }, { status: 200 });
    }

    const creditoIds = creditos.map((c: any) => c.id);
    const creditoMap = new Map(creditos.map((c: any) => [c.id, c]));

    // ------------------------------------------------------------------
    // 4. Fetch all cuotas for those credits
    // ------------------------------------------------------------------
    const { data: cuotas, error } = await supabase
      .from('cuotas')
      .select('*')
      .in('credito_id', creditoIds)
      .order('fecha_vencimiento', { ascending: true });

    if (error) {
      console.error('[mis-cuotas] Error al consultar cuotas:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar cuotas' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Enrich with credit info
    // ------------------------------------------------------------------
    const enriched: EnrichedCuota[] = (cuotas ?? []).map((cuota: any) => {
      const credito = creditoMap.get(cuota.credito_id);
      return {
        id: cuota.id,
        credito_id: cuota.credito_id,
        credito_monto: credito?.monto ?? '0',
        credito_estado: credito?.estado ?? 'desconocido',
        credito_descripcion: credito?.descripcion ?? null,
        numero_cuota: cuota.numero_cuota,
        total_cuotas: credito?.numero_cuotas ?? 1,
        monto_capital: cuota.monto_capital,
        monto_interes: cuota.monto_interes,
        monto_cuota: cuota.monto_cuota,
        saldo_restante: cuota.saldo_restante,
        fecha_vencimiento: cuota.fecha_vencimiento,
        estado: cuota.estado,
        tx_hash_pago: cuota.tx_hash_pago,
        fecha_pago: cuota.fecha_pago,
      };
    });

    // ------------------------------------------------------------------
    // 6. Return enriched cuotas
    // ------------------------------------------------------------------
    return NextResponse.json({ cuotas: enriched }, { status: 200 });
  } catch (err) {
    console.error('[mis-cuotas] Error inesperado:', err);
    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
