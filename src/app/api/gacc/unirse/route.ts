// =============================================================================
// POST /api/gacc/unirse — Unirse a un GACC mediante código
// =============================================================================
//
// Follows the same patterns as the main GACC route:
// - Zod validation at the boundary (400 on failure)
// - Session-based auth via getServerUser
// - Service-role client for DB operations
// - Spanish error codes
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser, PARTICIPANTE_AUTH_SELECT } from '@/lib/supabase/auth-bearer';
import { UnirseGaccSchema, validateUnirseGacc } from '@/lib/validations/gacc';
import { registrarAuditLog } from '@/lib/audit/logger';

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para unirte a un GACC' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id
    // ------------------------------------------------------------------
    let typedParticipante = bearerResult?.participante ?? null;
    if (!typedParticipante) {
      const { data: participante } = await supabase
        .from('participantes')
        .select(PARTICIPANTE_AUTH_SELECT)
        .eq('user_id', user.id)
        .single();

      typedParticipante = participante;
    }

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante registrado' },
        { status: 404 },
      );
    }

    // Check they don't already belong to a GACC
    if (typedParticipante.gacc_id) {
      return NextResponse.json(
        { error: 'YA_TIENE_GACC', detail: 'Ya perteneces a un GACC' },
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

    const validation = validateUnirseGacc(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { codigo } = validation.data;

    // ------------------------------------------------------------------
    // 4. Find GACC by code
    // ------------------------------------------------------------------
    const { data: grupo } = await supabase
      .from('grupos_gacc')
      .select('id, nombre, activo, municipio')
      .eq('codigo', codigo.toUpperCase().trim())
      .single();

    const typedGrupo = grupo;

    if (!typedGrupo) {
      return NextResponse.json(
        { error: 'GACC_NO_ENCONTRADO', detail: 'No se encontró un GACC con ese código. Verifica el código e intenta de nuevo.' },
        { status: 404 },
      );
    }

    if (!typedGrupo.activo) {
      return NextResponse.json(
        { error: 'GACC_INACTIVO', detail: 'Este GACC ya no está activo' },
        { status: 410 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check if already a member
    // ------------------------------------------------------------------
    const { data: existingMember } = await supabase
      .from('gacc_miembros')
      .select('id, validado_en')
      .eq('grupo_id', typedGrupo.id)
      .eq('participante_id', typedParticipante.id)
      .maybeSingle();

    const typedMember = existingMember;

    if (typedMember) {
      if (typedMember.validado_en) {
        // Already a validated member — just update participante
        await supabase
          .from('participantes')
          .update({ gacc_id: typedGrupo.id, validado_gacc: true })
          .eq('id', typedParticipante.id);

        return NextResponse.json(
          {
            status: 'ya_eras_miembro',
        grupo: { id: typedGrupo.id, nombre: typedGrupo.nombre, municipio: typedGrupo.municipio },
          },
          { status: 200 },
        );
      }

      // Pending validation
      return NextResponse.json(
        {
          status: 'pendiente_validacion',
          grupo: { id: typedGrupo.id, nombre: typedGrupo.nombre, municipio: typedGrupo.municipio },
          detail: 'Ya solicitaste unirte a este GACC. Espera a que un miembro te valide.',
        },
        { status: 200 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Insert membership (pending validation)
    // ------------------------------------------------------------------
    const { error: insertError } = await supabase
      .from('gacc_miembros')
      .insert({
        grupo_id: typedGrupo.id,
        participante_id: typedParticipante.id,
      });

    if (insertError) {
      console.error('[gacc/unirse] Error al insertar membresía:', insertError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar la membresía' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 7. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'gacc_miembro_unido',
      entidadTipo: 'gacc_miembro',
      entidadId: typedParticipante.id,
      participanteId: typedParticipante.id,
      detalles: { grupo_id: typedGrupo.id, grupo_nombre: typedGrupo.nombre },
    });

    // ------------------------------------------------------------------
    // 8. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'pendiente_validacion',
        grupo: { id: typedGrupo.id, nombre: typedGrupo.nombre, municipio: typedGrupo.municipio },
        detail: 'Te has unido al GACC. Un miembro del grupo debe validar tu membresía para que puedas solicitar créditos.',
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[gacc/unirse] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
