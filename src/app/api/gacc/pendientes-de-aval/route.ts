// =============================================================================
// GET /api/gacc/pendientes-de-aval — Créditos pendientes de aval en mi GACC
// =============================================================================
//
// Modelo GACC (circuito de 2 avales con roles):
//   - Aval 1/2: la referadora elegida por el solicitante (creditos.referadora_id)
//   - Aval 2/2: el Líder Social del grupo (grupos_gacc.lider_id)
//
// Para cada crédito pendiente devuelve el estado del circuito y el ROL del
// usuario actual respecto a ese crédito, para que la UI muestre el aval correcto
// (1/2 o 2/2) y habilite el botón solo a quien corresponde.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { scoreEfectivo } from '@/lib/score/calculator';

interface MeRow {
  id: string;
  nombre: string;
  gacc_id: string | null;
  validado_gacc: boolean;
}

interface CreditoRow {
  id: string;
  prestatario_id: string;
  referadora_id: string | null;
  monto: string;
  descripcion: string | null;
  fecha_solicitud: string;
  estado: string;
  expiracion_en: string | null;
}

interface AvalRow {
  credito_id: string;
  aval_id: string;
  rol_aval: string | null;
}

interface ParticipanteInfo {
  id: string;
  nombre: string;
  score_reputacion: number;
  created_at: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // 2. Current user's participante
    const { data: rawMe } = await supabase
      .from('participantes')
      .select('id, nombre, gacc_id, validado_gacc')
      .eq('user_id', user.id)
      .single();

    const me = rawMe as unknown as MeRow | null;

    if (!me) {
      return NextResponse.json({ error: 'SIN_PERFIL', detail: 'No tienes un perfil de participante' }, { status: 404 });
    }
    if (!me.gacc_id) {
      return NextResponse.json({ error: 'SIN_GACC', detail: 'No perteneces a un GACC' }, { status: 403 });
    }
    if (!me.validado_gacc) {
      return NextResponse.json({ error: 'GACC_NO_VALIDADO', detail: 'Debes ser validado en el GACC para ver y avalar créditos' }, { status: 403 });
    }

    const grupoId = me.gacc_id;
    const miId = me.id;

    // 3. Líder Social del grupo
    const { data: rawGrupo } = await supabase
      .from('grupos_gacc')
      .select('lider_id')
      .eq('id', grupoId)
      .single();
    const liderId = (rawGrupo as unknown as { lider_id: string | null } | null)?.lider_id ?? null;

    // 4. Members of the group (to scope credits)
    const { data: miembros } = await supabase
      .from('gacc_miembros')
      .select('participante_id')
      .eq('grupo_id', grupoId)
      .eq('activo', true);
    const miembroIds = (miembros ?? []).map((m: { participante_id: string }) => m.participante_id);

    if (miembroIds.length === 0) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    // 5. Pending credits from group members
    const { data: creditos, error: creditosError } = await supabase
      .from('creditos')
      .select('id, prestatario_id, referadora_id, monto, descripcion, fecha_solicitud, estado, expiracion_en')
      .in('prestatario_id', miembroIds)
      .eq('estado', 'pendiente')
      .order('fecha_solicitud', { ascending: false });

    if (creditosError) {
      console.error('[gacc/pendientes-de-aval] Error al consultar créditos:', creditosError.message);
      return NextResponse.json({ error: 'ERROR_INTERNO', detail: 'Error al consultar créditos pendientes' }, { status: 500 });
    }

    const ahora = new Date();
    const typedCreditos = ((creditos as unknown as CreditoRow[]) ?? []).filter((c) => {
      // Lazy expiration
      if (c.expiracion_en && new Date(c.expiracion_en) < ahora) {
        supabase.from('creditos').update({ estado: 'expirado' } as never).eq('id', c.id);
        return false;
      }
      return true;
    });

    if (typedCreditos.length === 0) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    const creditoIds = typedCreditos.map((c) => c.id);

    // 6. Active avales for those credits (with role)
    const { data: rawAvales } = await supabase
      .from('avales')
      .select('credito_id, aval_id, rol_aval')
      .in('credito_id', creditoIds)
      .eq('activo', true);
    const avales = (rawAvales ?? []) as unknown as AvalRow[];

    // 7. Names + scores for prestatarios and referadoras
    const idsParaNombre = [
      ...new Set([
        ...typedCreditos.map((c) => c.prestatario_id),
        ...typedCreditos.map((c) => c.referadora_id).filter((x): x is string => !!x),
      ]),
    ];
    const { data: personas } = await supabase
      .from('participantes')
      .select('id, nombre, score_reputacion, created_at')
      .in('id', idsParaNombre);
    const personaMap = new Map<string, ParticipanteInfo>();
    for (const p of personas ?? []) {
      const tp = p as unknown as ParticipanteInfo;
      personaMap.set(tp.id, tp);
    }

    // 8. Build circuit state per credit
    const creditosOut = typedCreditos.map((c) => {
      const avalesCredito = avales.filter((a) => a.credito_id === c.id);
      const avalReferadoraHecho = avalesCredito.some((a) => a.rol_aval === 'referadora');
      const avalLiderHecho = avalesCredito.some((a) => a.rol_aval === 'lider');
      const yaAvale = avalesCredito.some((a) => a.aval_id === miId);

      let miRol: 'referadora' | 'lider' | null = null;
      if (c.referadora_id && miId === c.referadora_id) miRol = 'referadora';
      else if (liderId && miId === liderId) miRol = 'lider';

      const puedoAvalar =
        !yaAvale &&
        miId !== c.prestatario_id &&
        ((miRol === 'referadora' && !avalReferadoraHecho) ||
          (miRol === 'lider' && avalReferadoraHecho && !avalLiderHecho));

      const prest = personaMap.get(c.prestatario_id);
      const refer = c.referadora_id ? personaMap.get(c.referadora_id) : null;
      const avalesActuales = (avalReferadoraHecho ? 1 : 0) + (avalLiderHecho ? 1 : 0);

      return {
        id: c.id,
        prestatario_id: c.prestatario_id,
        prestatario_nombre: prest?.nombre ?? 'Desconocido',
        prestatario_score_efectivo: prest ? scoreEfectivo(prest.score_reputacion, prest.created_at) : null,
        referadora_id: c.referadora_id,
        referadora_nombre: refer?.nombre ?? null,
        monto: c.monto,
        descripcion: c.descripcion,
        fecha_solicitud: c.fecha_solicitud,
        // Estado del circuito GACC
        aval_referadora_hecho: avalReferadoraHecho,
        aval_lider_hecho: avalLiderHecho,
        avales_actuales: avalesActuales,
        total_necesarios: 2,
        avales_minimos: 2, // compat con clientes que aún leen este campo
        mi_rol: miRol,
        puedo_avalar: puedoAvalar,
        ya_avale: yaAvale,
        es_propio: c.prestatario_id === miId,
      };
    });

    return NextResponse.json({ creditos: creditosOut }, { status: 200 });
  } catch (err) {
    console.error('[gacc/pendientes-de-aval] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
