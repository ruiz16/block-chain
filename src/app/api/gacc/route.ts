// =============================================================================
// GET  /api/gacc       — Listar GACCs disponibles
// POST /api/gacc       — Crear un nuevo GACC
// =============================================================================
//
// Follows the same patterns as creditos/route.ts:
// - Zod validation at the boundary (400 on failure)
// - Session-based auth via getServerUser
// - Service-role client for DB operations
// - Spanish error codes
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { CrearGaccSchema, validateCrearGacc } from '@/lib/validations/gacc';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a short, human-readable GACC join code.
 * Format: MANGLE-XXXX (4 uppercase alphanumeric chars)
 */
function generarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `MANGLE-${code}`;
}

// =============================================================================
// POST /api/gacc — Crear un GACC
// =============================================================================

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para crear un GACC' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id
    // ------------------------------------------------------------------
    const { data: participante } = await supabase
      .from('participantes')
      .select('id, gacc_id')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante as unknown as { id: string; gacc_id: string | null } | null;

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante registrado' },
        { status: 404 },
      );
    }

    // Check they don't already belong to a GACC
    if (typedParticipante.gacc_id) {
      return NextResponse.json(
        { error: 'YA_TIENE_GACC', detail: 'Ya perteneces a un GACC. No puedes crear otro.' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Parse and validate body via Zod
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CUERPO_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = validateCrearGacc(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { nombre, descripcion } = validation.data;

    // ------------------------------------------------------------------
    // 4. Generate unique code (retry if collision)
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // 5. INSERT grupo (trigger auto-adds creator as validated member)
    // ------------------------------------------------------------------
    const { data: grupo, error: insertError } = await supabase
      .from('grupos_gacc')
      .insert({
        nombre,
        descripcion: descripcion || null,
        codigo,
        creador_id: typedParticipante.id,
      } as never)
      .select()
      .single();

    const typedGrupo = grupo as unknown as { id: string; nombre: string; codigo: string; descripcion: string | null } | null;

    if (insertError || !typedGrupo) {
      console.error('[gacc] Error al crear GACC:', insertError?.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al crear el GACC en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Update participante.gacc_id and validado_gacc
    //    (creator is auto-validated by the trigger)
    // ------------------------------------------------------------------
    await supabase
      .from('participantes')
      .update({ gacc_id: typedGrupo.id, validado_gacc: true } as never)
      .eq('id', typedParticipante.id);

    // ------------------------------------------------------------------
    // 7. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'gacc_creado',
      entidadTipo: 'grupo_gacc',
      entidadId: typedGrupo.id,
      participanteId: typedParticipante.id,
      detalles: { nombre, codigo: typedGrupo.codigo },
    });

    // ------------------------------------------------------------------
    // 8. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'creado' as const,
        grupo: {
          id: typedGrupo.id,
          nombre: typedGrupo.nombre,
          codigo: typedGrupo.codigo,
          descripcion: typedGrupo.descripcion,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[gacc] Error inesperado en POST:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

// =============================================================================
// GET /api/gacc — Listar GACCs disponibles
// =============================================================================

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para ver los GACCs' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // List active groups with member counts
    const { data: grupos, error } = await supabase
      .from('grupos_gacc')
      .select(`
        *,
        miembro_count:gacc_miembros(count),
        creador:participantes!grupos_gacc_creador_id_fkey(nombre)
      `)
      .eq('activo', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[gacc] Error al listar GACCs:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar GACCs' },
        { status: 500 },
      );
    }

    return NextResponse.json({ grupos: grupos ?? [] }, { status: 200 });
  } catch (err) {
    console.error('[gacc] Error inesperado en GET:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
