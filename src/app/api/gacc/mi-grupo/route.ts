// =============================================================================
// GET /api/gacc/mi-grupo — Ver mi GACC y sus miembros
// =============================================================================
//
// Returns the current user's GACC group info along with the list of members
// and their validation status. Used by the /gacc page to render the group view.
//
// Follows the same patterns as the main GACC route.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { scoreEfectivo } from '@/lib/score/calculator';

export async function GET(): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante with GACC info
    // ------------------------------------------------------------------
    const { data: rawParticipante } = await supabase
      .from('participantes')
      .select('id, gacc_id, validado_gacc, nombre')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = rawParticipante;

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // If user doesn't belong to a GACC, return null
    if (!typedParticipante.gacc_id) {
      return NextResponse.json({ grupo: null, miembro: null }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Fetch GACC info
    // ------------------------------------------------------------------
    const { data: rawGrupo } = await supabase
      .from('grupos_gacc')
      .select('*')
      .eq('id', typedParticipante.gacc_id)
      .single();

    if (!rawGrupo) {
      return NextResponse.json(
        { error: 'GACC_NO_ENCONTRADO', detail: 'El GACC al que perteneces ya no existe' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Fetch members with validation status and participant names
    // ------------------------------------------------------------------
    const { data: miembros } = await supabase
      .from('gacc_miembros')
      .select(`
        id,
        grupo_id,
        participante_id,
        validado_por,
        validado_en,
        activo,
        created_at,
        participante:participantes!gacc_miembros_participante_id_fkey(
          nombre,
          wallet_address,
          score_reputacion,
          created_at
        ),
        validador:participantes!gacc_miembros_validado_por_fkey(
          nombre
        )
      `)
      .eq('grupo_id', typedParticipante.gacc_id)
      .eq('activo', true)
      .order('validado_en', { ascending: false, nullsFirst: false });

    // ------------------------------------------------------------------
    // 5. Add score_efectivo to each member
    // ------------------------------------------------------------------
    const miembrosConScore = (miembros ?? []).map((m: Record<string, unknown>) => {
      const participante = m.participante as Record<string, unknown> | null;
      return {
        ...m,
        score_efectivo: participante
          ? scoreEfectivo(
              participante.score_reputacion as number,
              participante.created_at as string,
            )
          : null,
      };
    });

    // ------------------------------------------------------------------
    // 6. Return
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        grupo: rawGrupo,
        miembro: {
          id: typedParticipante.id,
          nombre: typedParticipante.nombre,
          validado: typedParticipante.validado_gacc,
        },
        miembros: miembrosConScore,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[gacc/mi-grupo] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
