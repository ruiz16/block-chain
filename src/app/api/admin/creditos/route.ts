// =============================================================================
// GET /api/admin/creditos — Paginated Credit List with Participant Names
// =============================================================================
//
// Returns a paginated list of all credits with the prestatario's nombre.
// Guarded by requireAdmin().
//
// Query params:
//   page   — page number (default: 1)
//   limit  — items per page (default: 20, max: 100)
//
// Response:
//   { data: CreditoAdmin[], total: number, page: number, limit: number }
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
  descripcion: string | null;
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

export interface CreditoAdmin {
  id: string;
  prestatario_id: string;
  prestatario_nombre: string;
  monto: string;
  descripcion: string | null;
  estado: string;
  interes_porcentaje: string;
  plazo_dias: number;
  fecha_vencimiento: string | null;
  tx_hash: string | null;
  fecha_solicitud: string;
  fecha_actualizacion: string;
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

    // 3. Fetch paginated creditos
    const { data: creditos, count: total } = await supabase
      .from('creditos')
      .select('*', { count: 'exact' })
      .order('fecha_solicitud', { ascending: false })
      .range(from, to);

    const typedCreditos = creditos ?? [];

    // 4. Collect unique prestatario IDs and fetch their names
    const prestatarioIds = [...new Set(typedCreditos.map((c) => c.prestatario_id))];

    const { data: participantes } = await supabase
      .from('participantes')
      .select('id, nombre')
      .in('id', prestatarioIds);

    const typedParticipantes = participantes ?? [];
    const nombreMap = new Map(typedParticipantes.map((p) => [p.id, p.nombre]));

    // 5. Build enriched response
    const data: CreditoAdmin[] = typedCreditos.map((c) => ({
      id: c.id,
      prestatario_id: c.prestatario_id,
      prestatario_nombre: nombreMap.get(c.prestatario_id) ?? 'Desconocido',
      monto: c.monto,
      descripcion: c.descripcion,
      estado: c.estado,
      interes_porcentaje: String(c.interes_porcentaje),
      plazo_dias: c.plazo_dias,
      fecha_vencimiento: c.fecha_vencimiento,
      tx_hash: c.tx_hash,
      fecha_solicitud: c.fecha_solicitud,
      fecha_actualizacion: c.fecha_actualizacion,
      fecha_pago: c.fecha_pago,
    }));

    return NextResponse.json(
      { data, total: total ?? 0, page, limit },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/creditos] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
