// =============================================================================
// GET /api/admin/participantes — Paginated Participant List with Credit Stats
// =============================================================================
//
// Returns a paginated list of all participants with per-user credit statistics
// (totalCreditos, totalPrestado). Guarded by requireAdmin().
//
// Query params:
//   page   — page number (default: 1)
//   limit  — items per page (default: 20, max: 100)
//
// Response:
//   { data: ParticipanteAdmin[], total: number, page: number, limit: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/auth-guards';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface ParticipanteRow {
  id: string;
  created_at: string;
  wallet_address: string;
  nombre: string;
  rol: string;
  score_reputacion: number;
  activo: boolean;
  user_id: string;
}

interface CreditoStatsRow {
  prestatario_id: string;
  monto: string;
}

export interface ParticipanteAdmin {
  id: string;
  created_at: string;
  wallet_address: string;
  nombre: string;
  rol: string;
  score_reputacion: number;
  activo: boolean;
  user_id: string;
  totalCreditos: number;
  totalPrestado: string;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Step 1: Auth guard
    const guard = await requireAdmin(request);
    if (guard instanceof Response) return guard;

    // Step 2: Parse query params
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseClient();

    // Step 3: Fetch paginated participantes
    const { data: participantes, count: total } = await supabase
      .from('participantes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    const typedParticipantes = (participantes ?? []) as unknown as ParticipanteRow[];
    const participanteIds = typedParticipantes.map((p) => p.id);

    // Step 4: Fetch credit stats for all returned participants
    let creditStats: Map<string, { count: number; total: number }> = new Map();

    if (participanteIds.length > 0) {
      const { data: creditos } = await supabase
        .from('creditos')
        .select('prestatario_id, monto')
        .in('prestatario_id', participanteIds);

      const typedCreditos = (creditos ?? []) as unknown as CreditoStatsRow[];

      for (const c of typedCreditos) {
        const current = creditStats.get(c.prestatario_id) ?? { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(c.monto);
        creditStats.set(c.prestatario_id, current);
      }
    }

    // Step 5: Build enriched response
    const data: ParticipanteAdmin[] = typedParticipantes.map((p) => {
      const stats = creditStats.get(p.id) ?? { count: 0, total: 0 };
      return {
        id: p.id,
        created_at: p.created_at,
        wallet_address: p.wallet_address,
        nombre: p.nombre,
        rol: p.rol,
        score_reputacion: p.score_reputacion,
        activo: p.activo,
        user_id: p.user_id,
        totalCreditos: stats.count,
        totalPrestado: String(stats.total),
      };
    });

    // Step 6: Return response
    return NextResponse.json(
      { data, total: total ?? 0, page, limit },
      { status: 200 },
    );
  } catch (err) {
    console.error('[admin/participantes] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
