// =============================================================================
// GET /api/admin/audit-log — Paginated, Filterable Audit Log
// =============================================================================
//
// Returns paginated audit log entries with participante names joined.
// Supports filtering by action type and date range. Guarded by requireAdmin().
//
// Query params:
//   accion       — tipo_accion filter (optional)
//   fecha_desde  — ISO date lower bound on fecha (optional)
//   fecha_hasta  — ISO date upper bound on fecha (optional)
//   page         — page number (default: 1)
//   limit        — items per page (default: 20, max: 100)
//
// Response:
//   { data: AuditLogAdmin[], total: number, page: number, limit: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface AuditLogRow {
  id: number;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  participante_id: string | null;
  detalles: Record<string, unknown>;
  fecha: string;
}

interface ParticipanteIdRow {
  id: string;
  nombre: string;
}

export interface AuditLogAdmin {
  id: number;
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  participante_id: string | null;
  participante_nombre: string | null;
  detalles: Record<string, unknown>;
  fecha: string;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Step 1: Auth guard
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    // Step 2: Parse query params
    const url = new URL(request.url);
    const accion = url.searchParams.get('accion');
    const fechaDesde = url.searchParams.get('fecha_desde');
    const fechaHasta = url.searchParams.get('fecha_hasta');
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseClient();

    // Step 3: Build query
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' });

    // Apply filters
    if (accion) {
      query = query.eq('accion', accion);
    }
    if (fechaDesde) {
      query = query.gte('fecha', fechaDesde);
    }
    if (fechaHasta) {
      query = query.lte('fecha', fechaHasta);
    }

    // Order and paginate
    query = query
      .order('fecha', { ascending: false })
      .range(from, to);

    const { data: entries, count: total } = await query;

    const typedEntries = (entries ?? []) as unknown as AuditLogRow[];

    // Step 4: Join participante names
    const participanteIds = typedEntries
      .map((e) => e.participante_id)
      .filter((id): id is string => id !== null);

    // Deduplicate participante IDs
    const uniqueIds = [...new Set(participanteIds)];

    // Fetch participante names in a single batch
    const nombreMap = new Map<string, string>();

    if (uniqueIds.length > 0) {
      const { data: participantes } = await supabase
        .from('participantes')
        .select('id, nombre')
        .in('id', uniqueIds);

      if (participantes) {
        for (const p of participantes as unknown as ParticipanteIdRow[]) {
          nombreMap.set(p.id, p.nombre);
        }
      }
    }

    // Step 5: Build enriched response
    const data: AuditLogAdmin[] = typedEntries.map((entry) => ({
      id: entry.id,
      accion: entry.accion,
      entidad_tipo: entry.entidad_tipo,
      entidad_id: entry.entidad_id,
      participante_id: entry.participante_id,
      participante_nombre: entry.participante_id
        ? (nombreMap.get(entry.participante_id) ?? null)
        : null,
      detalles: entry.detalles,
      fecha: entry.fecha,
    }));

    // Step 6: Return response
    return NextResponse.json(
      { data, total: total ?? 0, page, limit },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/audit-log] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
