// =============================================================================
// GET /api/admin/gacc — Paginated GACC List with Member Counts
// =============================================================================
//
// Query params:
//   page   — page number (default: 1)
//   limit  — items per page (default: 20, max: 100)
//
// Response:
//   { data: GaccAdmin[], total: number, page: number, limit: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

export interface GaccAdmin {
  id: string;
  nombre: string;
  descripcion: string | null;
  codigo: string;
  municipio: string | null;
  activo: boolean;
  created_at: string;
  creador_nombre: string;
  total_miembros: number;
  miembros_validados: number;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseClient();

    const { data: grupos, count: total, error } = await supabase
      .from('grupos_gacc')
      .select(`
        id,
        nombre,
        descripcion,
        codigo,
        municipio,
        activo,
        created_at,
        creador:participantes!grupos_gacc_creador_id_fkey(nombre)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[admin/gacc] Error al consultar GACCs:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar GACCs' },
        { status: 500 },
      );
    }

    const grupoIds = (grupos ?? []).map((g) => g.id);

    let miembroStats: Map<string, { total: number; validados: number }> = new Map();

    if (grupoIds.length > 0) {
      const { data: miembros } = await supabase
        .from('gacc_miembros')
        .select('grupo_id, validado_por')
        .in('grupo_id', grupoIds)
        .eq('activo', true);

      for (const m of miembros ?? []) {
        const current = miembroStats.get(m.grupo_id) ?? { total: 0, validados: 0 };
        current.total += 1;
        if (m.validado_por !== null) current.validados += 1;
        miembroStats.set(m.grupo_id, current);
      }
    }

    const data: GaccAdmin[] = (grupos ?? []).map((g) => {
      const stats = miembroStats.get(g.id) ?? { total: 0, validados: 0 };
      const creador = Array.isArray(g.creador) ? g.creador[0] : g.creador;
      return {
        id: g.id,
        nombre: g.nombre,
        descripcion: g.descripcion ?? null,
        codigo: g.codigo,
        municipio: g.municipio ?? null,
        activo: g.activo,
        created_at: g.created_at,
        creador_nombre: creador?.nombre ?? '—',
        total_miembros: stats.total,
        miembros_validados: stats.validados,
      };
    });

    return NextResponse.json({ data, total: total ?? 0, page, limit }, { status: 200 });
  } catch (err) {
    console.error('[admin/gacc] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
