// =============================================================================
// GET  /api/admin/gacc — Paginated GACC List with Member Counts
// POST /api/admin/gacc — Create a GACC (admin-only, no member assignment)
// =============================================================================
//
// Query params (GET):
//   page   — page number (default: 1)
//   limit  — items per page (default: 20, max: 100)
//
// Body (POST):
//   { nombre: string, descripcion?: string, municipio: 'guapi' | 'timbiqui' }
//
// Response:
//   GET — { data: GaccAdmin[], total: number, page: number, limit: number }
//   POST — { status: 'creado', grupo: { id, nombre, codigo, descripcion, municipio } }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';
import { CrearGaccSchema } from '@/lib/validations/gacc';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a short, human-readable GACC join code: MANGLE-XXXX */
function generarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MANGLE-${code}`;
}

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

// =============================================================================
// POST /api/admin/gacc — Admin creates GACC (no member assignment)
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    const supabase = getSupabaseClient();

    // 1. Parse & validate body
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CUERPO_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = CrearGaccSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: validation.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      );
    }

    const { nombre, descripcion, municipio } = validation.data;

    // 2. Generate unique code
    let codigo = generarCodigo();
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from('grupos_gacc')
        .select('id')
        .eq('codigo', codigo)
        .maybeSingle();
      if (!existing) break;
      codigo = generarCodigo();
      attempts++;
    }

    // 3. Insert grupo (creador_id = null → trigger skips auto-add)
    const { data: grupo, error: insertError } = await supabase
      .from('grupos_gacc')
      .insert({
        nombre,
        descripcion: descripcion || null,
        codigo,
        creador_id: null,
        municipio,
      })
      .select()
      .single();

    if (insertError || !grupo) {
      console.error('[admin/gacc] Error al crear GACC:', insertError?.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al crear el GACC en la base de datos' },
        { status: 500 },
      );
    }

    // 4. Audit log
    await registrarAuditLog({
      accion: 'gacc_creado',
      entidadTipo: 'grupo_gacc',
      entidadId: grupo.id,
      participanteId: null,
      detalles: { nombre, codigo: grupo.codigo, creado_por: 'admin' },
    });

    // 5. Return 201
    return NextResponse.json(
      {
        status: 'creado' as const,
        grupo: {
          id: grupo.id,
          nombre: grupo.nombre,
          codigo: grupo.codigo,
          descripcion: grupo.descripcion,
          municipio: grupo.municipio,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[admin/gacc] Error inesperado en POST:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
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

    type GrupoRow = {
      id: string;
      nombre: string;
      descripcion: string | null;
      codigo: string;
      municipio: string | null;
      activo: boolean;
      created_at: string;
      creador: { nombre: string } | { nombre: string }[] | null;
    };

    const { data: grupos, count: total, error } = await (supabase
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
      .range(from, to) as unknown as Promise<{ data: GrupoRow[] | null; count: number | null; error: { message: string } | null }>);

    if (error) {
      console.error('[admin/gacc] Error al consultar GACCs:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar GACCs' },
        { status: 500 },
      );
    }

    const grupoIds = (grupos ?? []).map((g) => g.id);

    const miembroStats: Map<string | null, { total: number; validados: number }> = new Map();

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
