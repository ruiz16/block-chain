// =============================================================================
// GET /api/admin/cuotas — Paginated Cuotas List for Admin
// =============================================================================
//
// Returns a paginated list of all cuotas with prestatario nombres.
// Guarded by requireAdmin().
//
// Query params:
//   page    — page number (default: 1)
//   limit   — items per page (default: 20, max: 100)
//   estado  — optional filter (pendiente, pagada, vencida)
//   credito — optional filter by credito_id (UUID)
//
// Response:
//   { data: CuotaAdmin[], total: number, page: number, limit: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CuotaAdmin {
  id: string;
  credito_id: string;
  prestatario_nombre: string;
  numero_cuota: number;
  total_cuotas: number;
  monto_cuota: string;
  monto_capital: string;
  monto_interes: string;
  saldo_restante: string;
  fecha_vencimiento: string;
  estado: string;
  tx_hash_pago: string | null;
  fecha_pago: string | null;
  fecha_creacion: string;
}

// =============================================================================
// GET
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // 1. Auth guard
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    // 2. Parse query params
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const estadoFilter = url.searchParams.get('estado');
    const creditoFilter = url.searchParams.get('credito');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseClient();

    // 3. Build query
    let query = supabase
      .from('cuotas')
      .select('*', { count: 'exact' })
      .order('fecha_vencimiento', { ascending: false })
      .range(from, to);

    if (estadoFilter && ['pendiente', 'pagada', 'vencida'].includes(estadoFilter)) {
      query = query.eq('estado', estadoFilter);
    }
    if (creditoFilter) {
      query = query.eq('credito_id', creditoFilter);
    }

    const { data: cuotas, count: total, error } = await query;

    if (error) {
      console.error('[admin/cuotas] Error al consultar cuotas:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar cuotas' },
        { status: 500 },
      );
    }

    const typedCuotas = (cuotas ?? []) as any[];

    // 4. Fetch credit info (includes prestatario_id, numero_cuotas)
    const creditoIds = [...new Set(typedCuotas.map((c) => c.credito_id))];

    const { data: creditos } = await supabase
      .from('creditos')
      .select('id, prestatario_id, numero_cuotas')
      .in('id', creditoIds);

    const typedCreditos = (creditos ?? []) as any[];
    const creditoMap = new Map(typedCreditos.map((c: any) => [c.id, c]));

    // 5. Fetch prestatario nombres
    const prestatarioIds = [...new Set(typedCreditos.map((c: any) => c.prestatario_id))];

    const { data: participantes } = await supabase
      .from('participantes')
      .select('id, nombre')
      .in('id', prestatarioIds);

    const typedParticipantes = (participantes ?? []) as any[];
    const nombreMap = new Map(typedParticipantes.map((p: any) => [p.id, p.nombre]));

    // 6. Build enriched response
    const data: CuotaAdmin[] = typedCuotas.map((c: any) => {
      const cred = creditoMap.get(c.credito_id) as any;
      return {
        id: c.id,
        credito_id: c.credito_id,
        prestatario_nombre: nombreMap.get(cred?.prestatario_id) ?? 'Desconocido',
        numero_cuota: c.numero_cuota,
        total_cuotas: cred?.numero_cuotas ?? 1,
        monto_cuota: c.monto_cuota,
        monto_capital: c.monto_capital,
        monto_interes: c.monto_interes,
        saldo_restante: c.saldo_restante,
        fecha_vencimiento: c.fecha_vencimiento,
        estado: c.estado,
        tx_hash_pago: c.tx_hash_pago,
        fecha_pago: c.fecha_pago,
        fecha_creacion: c.fecha_creacion,
      };
    });

    return NextResponse.json(
      { data, total: total ?? 0, page, limit },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/cuotas] Error inesperado:', err);
    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
