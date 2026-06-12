// =============================================================================
// GET /api/gacc/pendientes-de-aval — Créditos pendientes de aval en mi GACC
// =============================================================================
//
// Devuelve todos los créditos en estado 'pendiente' solicitados por miembros
// del GACC al que pertenece el usuario autenticado.
//
// Para cada crédito incluye:
//   - Datos del crédito (monto, descripción, fecha)
//   - Datos del prestatario (nombre, score)
//   - Total de miembros del GACC que deben avalar (excluyendo al prestatario)
//   - Cuántos ya avalaron
//   - Si el usuario actual ya avaló este crédito
//
// Nuevo modelo (Junio 2026):
//   - El rol 'aval' ya no existe.
//   - Los miembros del GACC avalan los créditos de sus compañeros.
//   - Se necesita que TODOS los miembros (excepto el prestatario) avalen.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { scoreEfectivo } from '@/lib/score/calculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipanteInfo {
  id: string;
  nombre: string;
  gacc_id: string | null;
  validado_gacc: boolean;
  score_reputacion?: number;
  created_at?: string;
}

interface CreditoRow {
  id: string;
  prestatario_id: string;
  monto: string;
  descripcion: string | null;
  fecha_solicitud: string;
  estado: string;
  expiracion_en: string | null;
}

interface AvalRow {
  aval_id: string;
}

interface MiembroRow {
  participante_id: string;
}

interface PrestatarioInfo {
  nombre: string;
  score_reputacion: number;
  created_at: string;
}

// =============================================================================
// GET
// =============================================================================

export async function GET(request: Request): Promise<Response> {
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
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up current user's participante
    // ------------------------------------------------------------------
    const { data: rawMe } = await supabase
      .from('participantes')
      .select('id, nombre, gacc_id, validado_gacc')
      .eq('user_id', user.id)
      .single();

    const me = rawMe as unknown as ParticipanteInfo | null;

    if (!me) {
      return NextResponse.json(
        { error: 'SIN_PERFIL', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    if (!me.gacc_id) {
      return NextResponse.json(
        { error: 'SIN_GACC', detail: 'No perteneces a un GACC' },
        { status: 403 },
      );
    }

    if (!me.validado_gacc) {
      return NextResponse.json(
        { error: 'GACC_NO_VALIDADO', detail: 'Debes ser validado en el GACC para ver y avalar créditos' },
        { status: 403 },
      );
    }

    const grupoId = me.gacc_id;
    const miId = me.id;

    // ------------------------------------------------------------------
    // 3. Get all active GACC members (excluding current user)
    // ------------------------------------------------------------------
    const { data: miembros } = await supabase
      .from('gacc_miembros')
      .select('participante_id')
      .eq('grupo_id', grupoId)
      .eq('activo', true);

    const todosLosMiembros = (miembros ?? []).map((m: MiembroRow) => m.participante_id);

    // ------------------------------------------------------------------
    // 4. Find all credits from GACC members in 'pendiente' state
    // ------------------------------------------------------------------
    const { data: creditos, error: creditosError } = await supabase
      .from('creditos')
      .select('id, prestatario_id, monto, descripcion, fecha_solicitud, estado, expiracion_en')
      .in('prestatario_id', todosLosMiembros)
      .eq('estado', 'pendiente')
      .order('fecha_solicitud', { ascending: false });

    if (creditosError) {
      console.error('[gacc/pendientes-de-aval] Error al consultar créditos:', creditosError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar créditos pendientes' },
        { status: 500 },
      );
    }

    if (!creditos || creditos.length === 0) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    const typedCreditos = (creditos as unknown as CreditoRow[]).filter((c) => {
      // Lazy expiration: if past expiracion_en, mark as expirado and exclude
      if (c.expiracion_en && new Date(c.expiracion_en) < new Date()) {
        supabase.from('creditos').update({ estado: 'expirado' } as never).eq('id', c.id);
        return false;
      }
      return true;
    });

    if (typedCreditos.length === 0) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 5. For each credit, count avales and check if current user avaled
    // ------------------------------------------------------------------

    // 5a. Fetch prestatario info for all credits (names + scores)
    const prestatarioIds = [...new Set(typedCreditos.map((c) => c.prestatario_id))];

    const { data: prestatarios } = await supabase
      .from('participantes')
      .select('id, nombre, score_reputacion, created_at')
      .in('id', prestatarioIds);

    const prestatarioMap = new Map<string, PrestatarioInfo>();
    for (const p of (prestatarios ?? [])) {
      const typed = p as unknown as PrestatarioInfo;
      prestatarioMap.set((p as unknown as { id: string }).id, typed);
    }

    // 5b. For each credit, count avales from GACC members
    //     and check if current user already avaled
    const creditosConAvales = await Promise.all(
      typedCreditos.map(async (credito) => {
        // All GACC members except prestatario can aval
        const miembrosQueAvalan = todosLosMiembros.filter(
          (pid) => pid !== credito.prestatario_id,
        );

        const { count: avalCount } = await supabase
          .from('avales')
          .select('id', { count: 'exact', head: true })
          .eq('credito_id', credito.id)
          .eq('activo', true)
          .in('aval_id', miembrosQueAvalan);

        // Check if current user already avaled this credit
        const { data: miAval } = await supabase
          .from('avales')
          .select('id')
          .eq('credito_id', credito.id)
          .eq('aval_id', miId)
          .eq('activo', true)
          .maybeSingle();

        const prestatarioInfo = prestatarioMap.get(credito.prestatario_id);

        return {
          id: credito.id,
          prestatario_id: credito.prestatario_id,
          prestatario_nombre: prestatarioInfo?.nombre ?? 'Desconocido',
          prestatario_score_efectivo: prestatarioInfo
            ? scoreEfectivo(
                prestatarioInfo.score_reputacion,
                prestatarioInfo.created_at,
              )
            : null,
          monto: credito.monto,
          descripcion: credito.descripcion,
          fecha_solicitud: credito.fecha_solicitud,
          avales_minimos: 3,
          avales_actuales: avalCount ?? 0,
          ya_avale: !!miAval,
          es_propio: credito.prestatario_id === miId,
        };
      }),
    );

    // ------------------------------------------------------------------
    // 6. Return
    // ------------------------------------------------------------------
    return NextResponse.json({ creditos: creditosConAvales }, { status: 200 });
  } catch (err) {
    console.error('[gacc/pendientes-de-aval] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
