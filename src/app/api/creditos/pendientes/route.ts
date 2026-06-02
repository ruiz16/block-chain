// =============================================================================
// GET /api/creditos/pendientes — Listar créditos pendientes para aprobación
// =============================================================================
//
// Devuelve los créditos en estados pendiente/avalado/aprobado con el nombre
// y score del prestatario, más la cantidad de avales activos por crédito.
//
// Acceso restringido a: admin, aval, prestamista (requireReviewer).
//
// Auth flow:
// 1. Lee cookie de sesión via getServerUser()
// 2. Verifica que el usuario tenga rol reviewer (no prestatario)
// 3. Consulta créditos + avales en batch
// 4. Retorna { creditos: CreditoPendiente[] }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import type { CreditoPendiente } from '@/types/database';

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------

interface CreditoRowWithPrestatario {
  id: string;
  monto: string;
  estado: string;
  fecha_solicitud: string;
  prestatario_id: string;
  participantes:
    | { nombre: string; score_reputacion: number }
    | { nombre: string; score_reputacion: number }[];
}

export async function GET(): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session + reviewer role
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

    const { data: participante } = await supabase
      .from('participantes')
      .select('id, rol')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante as { id: string; rol: string } | null;

    if (
      !typedParticipante ||
      !['admin'].includes(typedParticipante.rol)
    ) {
      return NextResponse.json(
        { error: 'ACCESO_DENEGADO', detail: 'Solo administradores pueden ver créditos pendientes' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Fetch pending/approved credits with prestatario info
    // ------------------------------------------------------------------
    const { data, error } = await supabase
      .from('creditos')
      .select(
        `
        id,
        monto,
        estado,
        fecha_solicitud,
        prestatario_id,
        participantes!creditos_prestatario_id_fkey (
          nombre,
          score_reputacion
        )
      `,
      )
      .in('estado', ['pendiente', 'avalado', 'aprobado'])
      .order('fecha_solicitud', { ascending: false });

    if (error) {
      console.error('[creditos/pendientes] Error al consultar créditos:', error.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar créditos pendientes' },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Fetch aval counts in batch
    // ------------------------------------------------------------------
    const rawRows = data as CreditoRowWithPrestatario[];
    const creditIds = rawRows.map((r) => r.id);

    const { data: avalCounts } = await supabase
      .from('avales')
      .select('credito_id, id')
      .in('credito_id', creditIds)
      .eq('activo', true);

    const avalCountMap: Record<string, number> = {};
    if (avalCounts) {
      for (const row of avalCounts) {
        const cid = (row as { credito_id: string; id: string }).credito_id;
        avalCountMap[cid] = (avalCountMap[cid] ?? 0) + 1;
      }
    }

    // ------------------------------------------------------------------
    // 4. Build response
    // ------------------------------------------------------------------
    const creditos: CreditoPendiente[] = rawRows.map((row) => {
      const rawPrestatario = row.participantes;
      const prestatario = Array.isArray(rawPrestatario) ? rawPrestatario[0] : rawPrestatario;

      return {
        id: row.id,
        monto: Number(row.monto),
        solicitante: prestatario?.nombre ?? 'Desconocido',
        score: prestatario?.score_reputacion ?? 0,
        fecha: row.fecha_solicitud,
        estado: row.estado as CreditoPendiente['estado'],
        prestatarioId: row.prestatario_id,
        avalCount: avalCountMap[row.id] ?? 0,
      };
    });

    return NextResponse.json({ creditos }, { status: 200 });
  } catch (err) {
    console.error('[creditos/pendientes] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
