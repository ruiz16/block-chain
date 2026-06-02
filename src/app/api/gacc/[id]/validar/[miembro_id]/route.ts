// =============================================================================
// POST /api/gacc/[id]/validar/[miembro_id] — Validar miembro del GACC
// =============================================================================
//
// Cualquier miembro activo y validado del GACC puede validar a un nuevo
// miembro. Esto implementa la validación social comunitaria.
//
// Follows the same patterns as the main GACC route.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { registrarAuditLog } from '@/lib/audit/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; miembro_id: string }> },
): Promise<Response> {
  try {
    const { id: grupoId, miembro_id: miembroId } = await params;

    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para validar un miembro' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up the validator (current user)
    // ------------------------------------------------------------------
    const { data: validador } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const typedValidador = validador;

    if (!typedValidador) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Verify the validator is an active member of this GACC
    // ------------------------------------------------------------------
    const { data: membershipValidador } = await supabase
      .from('gacc_miembros')
      .select('id')
      .eq('grupo_id', grupoId)
      .eq('participante_id', typedValidador.id)
      .eq('activo', true)
      .not('validado_en', 'is', null)  // Must be validated themselves
      .maybeSingle();

    if (!membershipValidador) {
      return NextResponse.json(
        {
          error: 'NO_AUTORIZADO',
          detail: 'Debes ser un miembro activo y validado de este GACC para validar a otros.',
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Find the target member's pending membership
    // ------------------------------------------------------------------
    const { data: targetMembership } = await supabase
      .from('gacc_miembros')
      .select('id, participante_id')
      .eq('grupo_id', grupoId)
      .eq('participante_id', miembroId)
      .eq('activo', true)
      .is('validado_en', null)  // Must be pending
      .maybeSingle();

    const typedTarget = targetMembership;

    if (!typedTarget) {
      return NextResponse.json(
        {
          error: 'MIEMBRO_NO_ENCONTRADO',
          detail: 'No se encontró una solicitud de membresía pendiente para este participante.',
        },
        { status: 404 },
      );
    }

    // Don't allow self-validation
    if (typedTarget.participante_id === typedValidador.id) {
      return NextResponse.json(
        { error: 'AUTO_VALIDACION', detail: 'No puedes validarte a ti mismo. Otro miembro del GACC debe hacerlo.' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Validate the member
    // ------------------------------------------------------------------
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('gacc_miembros')
      .update({
        validado_por: typedValidador.id,
        validado_en: now,
      })
      .eq('id', typedTarget.id);

    if (updateError) {
      console.error('[gacc/validar] Error al validar miembro:', updateError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al validar el miembro' },
        { status: 500 },
      );
    }

    // Also update participante row
    await supabase
      .from('participantes')
      .update({ validado_gacc: true, gacc_id: grupoId })
      .eq('id', miembroId);

    // ------------------------------------------------------------------
    // 6. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'gacc_miembro_validado',
      entidadTipo: 'gacc_miembro',
      entidadId: miembroId,
      participanteId: typedValidador.id,
      detalles: { grupo_id: grupoId, validado_por: typedValidador.id },
    });

    // ------------------------------------------------------------------
    // 7. Return 200
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'validado',
        detail: 'El miembro ha sido validado exitosamente.',
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[gacc/validar] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
