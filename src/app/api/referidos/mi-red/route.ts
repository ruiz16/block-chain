// =============================================================================
// GET /api/referidos/mi-red — Mi red de apoyo
// =============================================================================
//
// Devuelve la información de la red de apoyo del usuario autenticado,
// incluyendo miembros con sus scores efectivos y el estado del semáforo.
//
// Response:
//   { red: { id, nombre, score_red, estado } | null, miembros: [], total_miembros }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { scoreEfectivo } from '@/lib/score/calculator';

export async function GET(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // 1. Obtener participante
    const { data: rawP } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { id: string } | null;
    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // 2. Obtener membresía
    const { data: rawMiembro } = await supabase
      .from('red_miembros')
      .select('red_id, es_referidora')
      .eq('participante_id', participante.id)
      .single();

    const miembro = rawMiembro as unknown as { red_id: string; es_referidora: boolean } | null;

    if (!miembro) {
      return NextResponse.json({ red: null, miembros: [] }, { status: 200 });
    }

    // 3. Obtener info de la red
    const { data: rawRed } = await supabase
      .from('redes_apoyo')
      .select('id, nombre, score_red, estado')
      .eq('id', miembro.red_id)
      .single();

    const red = rawRed as unknown as { id: string; nombre: string; score_red: number; estado: string } | null;
    if (!red) {
      return NextResponse.json({ error: 'RED_NO_ENCONTRADA', detail: 'La red ya no existe' }, { status: 404 });
    }

    // 4. Obtener miembros con scores
    const { data: rawMiembros } = await supabase
      .from('red_miembros')
      .select(`
        participante_id,
        es_referidora,
        participante:participantes!red_miembros_participante_id_fkey(
          nombre,
          score_reputacion,
          created_at
        )
      `)
      .eq('red_id', miembro.red_id);

    const miembros = rawMiembros as unknown as {
      participante_id: string;
      es_referidora: boolean;
      participante: { nombre: string; score_reputacion: number; created_at: string } | { nombre: string; score_reputacion: number; created_at: string }[];
    }[] | null;

    const miembrosConScore = (miembros ?? []).map((m) => {
      const rawPdata = m.participante;
      const pdata = Array.isArray(rawPdata) ? rawPdata[0] : rawPdata;
      return {
        id: m.participante_id,
        nombre: pdata?.nombre ?? '—',
        score_efectivo: pdata ? scoreEfectivo(pdata.score_reputacion, pdata.created_at) : 0,
        es_referidora: m.es_referidora,
      };
    });

    return NextResponse.json({
      red: {
        id: red.id,
        nombre: red.nombre,
        score_red: red.score_red,
        estado: red.estado,
      },
      miembros: miembrosConScore,
      total_miembros: miembrosConScore.length,
    }, { status: 200 });
  } catch (err) {
    console.error('[referidos/mi-red] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
