// =============================================================================
// GET /api/admin/metrics — Aggregate Admin Metrics
// =============================================================================
//
// Returns aggregate KPIs computed from the creditos and participantes tables.
// Guarded by requireAdmin() — only admin users can access.
//
// Metrics returned:
//   totalParticipantes  — COUNT(*) FROM participantes
//   totalCreditos       — COUNT(*) FROM creditos
//   totalDesembolsado   — SUM(monto) WHERE estado = 'desembolsado'
//   totalPagado         — SUM(monto) WHERE estado = 'pagado'
//   enCirculacion       — SUM(monto) WHERE estado IN (active/lent states)
//   defaultRate         — (defaults / totalCreditos) * 100
//   scorePromedio       — AVG(score_reputacion) FROM participantes
//
// All numeric aggregations use COALESCE/fallback to 0 for empty DB.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
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

    // Step 3: Average reputation score
    const { data: scores } = await supabase
      .from('participantes')
      .select('score_reputacion');

    const typedScores = (scores ?? []) as unknown as ScoreRow[];
    const scorePromedio =
      typedScores.length > 0
        ? typedScores.reduce((sum, s) => sum + s.score_reputacion, 0) / typedScores.length
        : 0;

    // Step 4: All credits for aggregation
    const { data: creditos } = await supabase
      .from('creditos')
      .select('monto, estado');

    const typedCreditos = (creditos ?? []) as unknown as CreditoMontoRow[];
    const totalCreditos = typedCreditos.length;

    // Step 5: Aggregate by estado
    let totalDesembolsado = 0;
    let totalPagado = 0;
    let enCirculacion = 0;
    let totalDefaults = 0;

    for (const c of typedCreditos) {
      const monto = Number(c.monto);
      switch (c.estado) {
        case 'desembolsado':
          totalDesembolsado += monto;
          enCirculacion += monto;
          break;
        case 'pagado':
          totalPagado += monto;
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

    const defaultRate = totalCreditos > 0 ? (totalDefaults / totalCreditos) * 100 : 0;

    // Step 6: Return metrics
    return NextResponse.json(
      {
        totalParticipantes,
        totalCreditos,
        totalDesembolsado: String(totalDesembolsado),
        totalPagado: String(totalPagado),
        enCirculacion: String(enCirculacion),
        defaultRate: Math.round(defaultRate * 100) / 100,
        scorePromedio: Math.round(scorePromedio * 100) / 100,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/metrics] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
