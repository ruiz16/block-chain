// =============================================================================
// GET /api/admin/dashboard — Comprehensive Admin Dashboard
// =============================================================================
//
// Returns everything needed for the admin dashboard page.
// Guarded by requireAdmin() — only admin users can access.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------
interface CreditoMontoRow {
  monto: string;
  estado: string;
}

interface ScoreRow {
  score_reputacion: number;
}

interface CountRow {
  count: number;
}

interface RedScoreRow {
  score_red: number;
}

interface CreditoEventoRow {
  id: string;
  prestatario_id: string;
  monto: string;
  estado: string;
  fecha_actualizacion: string;
}

interface ParticipanteNombreRow {
  id: string;
  nombre: string;
}

export interface DashboardUltimoEvento {
  id: string;
  participante_nombre: string;
  tipo: string;
  monto: string;
  estado: string;
  fecha: string;
}

export interface DashboardResponse {
  totalParticipantes: number;
  participantesActivos: number;
  scorePromedio: number;
  creditosActivos: number;
  totalDesembolsado: string;
  totalRecuperado: string;
  enCirculacion: string;
  tasaRepago: number;
  morosidad: number;
  scoreRedPromedio: number | null;
  ultimosEventos: DashboardUltimoEvento[];
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Step 1: Auth guard
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    const supabase = getSupabaseClient();

    // Step 2: Total participantes
    const { data: participanteCount } = await supabase
      .from('participantes')
      .select('id', { count: 'exact', head: true });

    const totalParticipantes = participanteCount?.length ?? 0;

    // Step 3: Active participants (with estado activo)
    const { data: activosCount } = await supabase
      .from('participantes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'activo');

    const participantesActivos = activosCount?.length ?? 0;

    // Step 4: Average reputation score
    const { data: scores } = await supabase
      .from('participantes')
      .select('score_reputacion');

    const typedScores = (scores ?? []) as unknown as ScoreRow[];
    const scorePromedio =
      typedScores.length > 0
        ? typedScores.reduce((sum, s) => sum + s.score_reputacion, 0) / typedScores.length
        : 0;

    // Step 5: All credits for aggregation
    const { data: creditos } = await supabase
      .from('creditos')
      .select('monto, estado');

    const typedCreditos = (creditos ?? []) as unknown as CreditoMontoRow[];
    const totalCreditos = typedCreditos.length;

    let creditosActivos = 0;
    let totalDesembolsado = 0;
    let totalRecuperado = 0;
    let enCirculacion = 0;
    let totalDefaults = 0;

    for (const c of typedCreditos) {
      const monto = Number(c.monto);
      switch (c.estado) {
        case 'desembolsado':
          creditosActivos++;
          totalDesembolsado += monto;
          enCirculacion += monto;
          break;
        case 'pagado':
          totalRecuperado += monto;
          break;
        case 'pendiente':
        case 'avalado':
        case 'aprobado':
          enCirculacion += monto;
          break;
        case 'default':
          totalDefaults++;
          break;
      }
    }

    const tasaRepago = totalCreditos > 0 ? (typedCreditos.filter(c => c.estado === 'pagado').length / totalCreditos) * 100 : 0;
    const morosidad = totalCreditos > 0 ? (totalDefaults / totalCreditos) * 100 : 0;

    // Step 6: Average red score
    const { data: redesScores } = await supabase
      .from('redes_apoyo')
      .select('score_red');

    const typedRedesScores = (redesScores ?? []) as unknown as RedScoreRow[];
    const scoreRedPromedio =
      typedRedesScores.length > 0
        ? typedRedesScores.reduce((sum, r) => sum + r.score_red, 0) / typedRedesScores.length
        : null;

    // Step 7: Recent events (last 10 creditos)
    const { data: creditosRecientes } = await supabase
      .from('creditos')
      .select('id, prestatario_id, monto, estado, fecha_actualizacion')
      .order('fecha_actualizacion', { ascending: false })
      .limit(10);

    const typedEventos = (creditosRecientes ?? []) as unknown as CreditoEventoRow[];

    // Fetch participant names for these events
    const prestatarioIds = [...new Set(typedEventos.map((e) => e.prestatario_id))];

    const { data: participantes } = await supabase
      .from('participantes')
      .select('id, nombre')
      .in('id', prestatarioIds);

    const typedParticipantes = (participantes ?? []) as unknown as ParticipanteNombreRow[];
    const nombreMap = new Map(typedParticipantes.map((p) => [p.id, p.nombre]));

    const ultimosEventos: DashboardUltimoEvento[] = typedEventos.map((e) => ({
      id: e.id,
      participante_nombre: nombreMap.get(e.prestatario_id) ?? 'Desconocido',
      tipo: e.estado,
      monto: e.monto,
      estado: e.estado,
      fecha: e.fecha_actualizacion,
    }));

    // Step 8: Build response
    const response: DashboardResponse = {
      totalParticipantes,
      participantesActivos,
      scorePromedio: Math.round(scorePromedio * 100) / 100,
      creditosActivos,
      totalDesembolsado: String(totalDesembolsado),
      totalRecuperado: String(totalRecuperado),
      enCirculacion: String(enCirculacion),
      tasaRepago: Math.round(tasaRepago * 100) / 100,
      morosidad: Math.round(morosidad * 100) / 100,
      scoreRedPromedio: scoreRedPromedio !== null ? Math.round(scoreRedPromedio * 100) / 100 : null,
      ultimosEventos,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[admin/dashboard] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
