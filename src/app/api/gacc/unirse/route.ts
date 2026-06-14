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

// ---------------------------------------------------------------------------
// Resolución del Líder Social (modelo GACC)
// ---------------------------------------------------------------------------

/**
 * Si el email del participante coincide con grupos_gacc.email_lider (pre-asignado
 * por el FLD) y el grupo aún no tiene lider_id, lo marca como Líder Social.
 * El `.is('lider_id', null)` actúa como guard contra condiciones de carrera:
 * solo un participante puede ganar la asignación.
 *
 * @returns true si el participante quedó (o ya era) el Líder Social del grupo.
 */
async function resolverLiderSocial(
  supabase: ReturnType<typeof getSupabaseClient>,
  grupo: { id: string; email_lider: string | null; lider_id: string | null },
  participante: { id: string; email: string },
): Promise<boolean> {
  if (grupo.lider_id) return grupo.lider_id === participante.id;
  if (!grupo.email_lider) return false;

  const emailParticipante = (participante.email ?? '').toLowerCase().trim();
  const emailLider = grupo.email_lider.toLowerCase().trim();

  if (!emailParticipante || emailParticipante !== emailLider) return false;

  const { error } = await supabase
    .from('grupos_gacc')
    .update({ lider_id: participante.id } as never)
    .eq('id', grupo.id)
    .is('lider_id', null);

  if (error) {
    console.warn('[gacc/unirse] Error al asignar líder social:', error.message);
    return false;
  }

  return true;
}

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
      .select('id, nombre, activo, municipio, creador_id, email_lider, lider_id')
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
      // Ensure participante is always in sync regardless of how they got here
      await supabase
        .from('participantes')
        .update({ gacc_id: typedGrupo.id, validado_gacc: true })
        .eq('id', typedParticipante.id);

      if (!typedMember.validado_en) {
        // Legacy row without validation — complete it now
        await supabase
          .from('gacc_miembros')
          .update({ validado_por: typedGrupo.creador_id, validado_en: new Date().toISOString() })
          .eq('id', typedMember.id);
      }

      const esLider = await resolverLiderSocial(
        supabase,
        { id: typedGrupo.id, email_lider: typedGrupo.email_lider, lider_id: typedGrupo.lider_id },
        { id: typedParticipante.id, email: (typedParticipante as { email?: string | null }).email ?? '' },
      );

      return NextResponse.json(
        {
          status: 'ya_eras_miembro',
          es_lider: esLider,
          grupo: { id: typedGrupo.id, nombre: typedGrupo.nombre, municipio: typedGrupo.municipio },
        },
        { status: 200 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Insert membership (auto-validated by GACC creator)
    // ------------------------------------------------------------------
    const now = new Date().toISOString();

    const { error: insertError } = await supabase
      .from('gacc_miembros')
      .insert({
        grupo_id: typedGrupo.id,
        participante_id: typedParticipante.id,
        validado_por: typedGrupo.creador_id,
        validado_en: now,
      });

    if (insertError) {
      console.error('[gacc/unirse] Error al insertar membresía:', insertError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar la membresía' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 6b. Sync participante row so gacc_id-based guards work immediately
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('participantes')
      .update({ gacc_id: typedGrupo.id, validado_gacc: true })
      .eq('id', typedParticipante.id);

    if (updateError) {
      console.error('[gacc/unirse] Error al actualizar gacc_id:', updateError.message);
    }

    // ------------------------------------------------------------------
    // 6c. Resolver Líder Social si el email coincide con email_lider
    // ------------------------------------------------------------------
    const esLider = await resolverLiderSocial(
      supabase,
      { id: typedGrupo.id, email_lider: typedGrupo.email_lider, lider_id: typedGrupo.lider_id },
      { id: typedParticipante.id, email: (typedParticipante as { email?: string | null }).email ?? '' },
    );

    // ------------------------------------------------------------------
    // 7. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'gacc_miembro_unido',
      entidadTipo: 'gacc_miembro',
      entidadId: typedParticipante.id,
      participanteId: typedParticipante.id,
      detalles: { grupo_id: typedGrupo.id, grupo_nombre: typedGrupo.nombre, es_lider: esLider },
    });

    // ------------------------------------------------------------------
    // 8. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'validado',
        es_lider: esLider,
        grupo: { id: typedGrupo.id, nombre: typedGrupo.nombre, municipio: typedGrupo.municipio },
        detail: esLider
          ? 'Te has unido al GACC como Líder Social.'
          : 'Te has unido al GACC y fuiste validado automáticamente.',
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
