// =============================================================================
// GET /api/admin/desembolsos — Paginated Disbursement List
// =============================================================================
//
// Returns a paginated list of all disbursed credits (estado IN desembolsado,
// pagado, default) with the prestatario's nombre and tx_hash for blockchain
// explorer links. Guarded by requireAdmin().
//
// Query params:
//   page   — page number (default: 1)
//   limit  — items per page (default: 20, max: 100)
//
// Response:
//   { data: DesembolsoAdmin[], total: number, page: number, limit: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditoRow {
  id: string;
  prestatario_id: string;
  monto: string;
  estado: string;
  interes_porcentaje: number | string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  tx_hash: string | null;
  fecha_solicitud: string;
  fecha_actualizacion: string;
  fecha_pago: string | null;
}

interface ParticipanteRow {
  id: string;
  nombre: string;
}

export interface DesembolsoAdmin {
  id: string;
  prestatario_id: string;
  prestatario_nombre: string;
  monto: string;
  estado: string;
  interes_porcentaje: string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  tx_hash: string | null;
  fecha_solicitud: string;
  fecha_desembolso: string;
  fecha_pago: string | null;
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
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseClient();

    // 3. Fetch paginated creditos that were disbursed
    const { data: creditos, count: total } = await supabase
      .from('creditos')
      .select('*', { count: 'exact' })
      .in('estado', ['desembolsado', 'pagado', 'default'])
      .order('fecha_actualizacion', { ascending: false })
      .range(from, to);

    const typedCreditos = creditos ?? [];

    // 4. Fetch participant names
    const prestatarioIds = [...new Set(typedCreditos.map((c) => c.prestatario_id))];

    const { data: participantes } = await supabase
      .from('participantes')
      .select('id, nombre')
      .in('id', prestatarioIds);

    const typedParticipantes = participantes ?? [];
    const nombreMap = new Map(typedParticipantes.map((p) => [p.id, p.nombre]));

    // 5. Build enriched response
    const data: DesembolsoAdmin[] = typedCreditos.map((c) => ({
      id: c.id,
      prestatario_id: c.prestatario_id,
      prestatario_nombre: nombreMap.get(c.prestatario_id) ?? 'Desconocido',
      monto: c.monto,
      estado: c.estado,
      interes_porcentaje: String(c.interes_porcentaje),
      plazo_dias: c.plazo_dias,
      fecha_vencimiento: c.fecha_vencimiento,
      tx_hash: c.tx_hash,
      fecha_solicitud: c.fecha_solicitud,
      fecha_desembolso: c.fecha_actualizacion,
      fecha_pago: c.fecha_pago,
    }));

    return NextResponse.json(
      { data, total: total ?? 0, page, limit },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/desembolsos] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
