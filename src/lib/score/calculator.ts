// =============================================================================
// Score Calculator — Dynamic Reputation Scoring Service
// =============================================================================
//
// Central service for all score-related operations.
//
// recalcularScore(participanteId, tipo, ref) — Called after a payment or
//   default event. Calculates delta, inserts evento_score row, updates
//   participantes.score_reputacion. Returns the new score.
//
// scoreEfectivo(participante) — Called on-read to get the effective score
//   including seniority bonus. Pure function, no side effects.
//
// recalcularTodosLosScores() — Called manually by admin. Recalculates
//   seniority for all active participants, inserting recalculo_manual
//   events only when the score actually changes.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TipoEventoScore = 'pago_puntual' | 'pago_atrasado' | 'default';

interface ParticipanteScore {
  id: string;
  score_reputacion: number;
  created_at: string;
}

interface RecalcularParams {
  participanteId: string;
  tipo: TipoEventoScore;
  referenciaTipo?: 'credito' | 'cuota';
  referenciaId?: string;
}

interface EventoScoreRow {
  id: string;
  participante_id: string;
  tipo_evento: string;
  delta: number;
  score_anterior: number;
  score_nuevo: number;
  referencia_tipo: string | null;
  referencia_id: string | null;
  created_at: string;
}

interface HistorialResponse {
  eventos: EventoScoreRow[];
  score_efectivo: number;
  score_eventos: number;
  antiguedad_meses: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELTAS: Record<TipoEventoScore, number> = {
  pago_puntual: 2,
  pago_atrasado: -1,
  default: -15,
};

const MAX_ANTIGUEDAD = 10;
const DEFAULT_COOLDOWN_DIAS = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function diffMeses(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12
    + (to.getMonth() - from.getMonth());
}

// ---------------------------------------------------------------------------
// Score Efectivo (on-read, pure function)
// ---------------------------------------------------------------------------

/**
 * Calcula el score efectivo incluyendo antigüedad.
 * Se llama desde cualquier lugar que muestre o use el score para decisiones.
 * Pure function — no tiene side effects.
 */
export function scoreEfectivo(scoreReputacion: number, createdAt: string): number {
  const meses = diffMeses(new Date(createdAt), new Date());
  return clamp(scoreReputacion + Math.min(meses, MAX_ANTIGUEDAD), 0, 100);
}

// ---------------------------------------------------------------------------
// Cooldown check
// ---------------------------------------------------------------------------

/**
 * Verifica si ya hubo un evento del mismo tipo en los últimos N días.
 * Previene múltiples aplicaciones del mismo evento (ej. default cooldown).
 */
async function tieneCooldown(
  supabase: ReturnType<typeof getSupabaseClient>,
  participanteId: string,
  tipo: TipoEventoScore,
  dias: number = DEFAULT_COOLDOWN_DIAS,
): Promise<boolean> {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data } = await supabase
    .from('eventos_score')
    .select('id')
    .eq('participante_id', participanteId)
    .eq('tipo_evento', tipo)
    .gte('created_at', desde.toISOString())
    .limit(1)
    .maybeSingle();

  return data !== null;
}

// ---------------------------------------------------------------------------
// Recalcular Score (post-evento)
// ---------------------------------------------------------------------------

/**
 * Recalcula el score después de un evento (pago, default).
 *
 * Flujo:
 * 1. Lee participante actual
 * 2. Verifica cooldown (solo para 'default')
 * 3. Calcula delta del evento
 * 4. Aplica clamp(0, 100)
 * 5. Inserta en eventos_score
 * 6. Actualiza participantes.score_reputacion
 * 7. Retorna el nuevo score
 */
export async function recalcularScore(params: RecalcularParams): Promise<number> {
  const supabase = getSupabaseClient();

  // 1. Get current participante
  const { data: rawParticipante } = await supabase
    .from('participantes')
    .select('id, score_reputacion, created_at')
    .eq('id', params.participanteId)
    .single();

  const participante = rawParticipante as unknown as ParticipanteScore | null;

  if (!participante) {
    throw new Error(`Participante no encontrado: ${params.participanteId}`);
  }

  // 2. Cooldown check for 'default'
  if (params.tipo === 'default') {
    const enCooldown = await tieneCooldown(supabase, params.participanteId, 'default');
    if (enCooldown) {
      // Return current score without changes
      return scoreEfectivo(participante.score_reputacion, participante.created_at);
    }
  }

  // 3. Calculate new score
  const delta = DELTAS[params.tipo];
  const scoreAnterior = participante.score_reputacion;
  const scoreNuevo = clamp(scoreAnterior + delta, 0, 100);

  // Skip if no change
  if (scoreNuevo === scoreAnterior) {
    return scoreEfectivo(scoreNuevo, participante.created_at);
  }

  // 4. Insert evento_score
  const { error: insertError } = await supabase
    .from('eventos_score')
    .insert({
      participante_id: params.participanteId,
      tipo_evento: params.tipo,
      delta,
      score_anterior: scoreAnterior,
      score_nuevo: scoreNuevo,
      referencia_tipo: params.referenciaTipo ?? null,
      referencia_id: params.referenciaId ?? null,
    } as never);

  if (insertError) {
    console.error('[score] Error al insertar evento_score:', insertError.message);
  }

  // 5. Update participante score
  const { error: updateError } = await supabase
    .from('participantes')
    .update({ score_reputacion: scoreNuevo } as never)
    .eq('id', params.participanteId);

  if (updateError) {
    console.error('[score] Error al actualizar score_reputacion:', updateError.message);
  }

  return scoreEfectivo(scoreNuevo, participante.created_at);
}

// ---------------------------------------------------------------------------
// Obtener historial de eventos
// ---------------------------------------------------------------------------

/**
 * Retorna los últimos N eventos de score para un participante,
 * junto con el score efectivo actual.
 */
export async function obtenerHistorialScore(
  participanteId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<HistorialResponse> {
  const supabase = getSupabaseClient();

  // Get participante data
  const { data: rawParticipante } = await supabase
    .from('participantes')
    .select('id, score_reputacion, created_at')
    .eq('id', participanteId)
    .single();

  const participante = rawParticipante as unknown as ParticipanteScore | null;

  if (!participante) {
    throw new Error(`Participante no encontrado: ${participanteId}`);
  }

  // Get events
  const { data: rawEventos } = await supabase
    .from('eventos_score')
    .select('*')
    .eq('participante_id', participanteId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const eventos = (rawEventos ?? []) as unknown as EventoScoreRow[];
  const scoreEventos = participante.score_reputacion;
  const meses = diffMeses(new Date(participante.created_at), new Date());

  return {
    eventos,
    score_efectivo: scoreEfectivo(scoreEventos, participante.created_at),
    score_eventos: scoreEventos,
    antiguedad_meses: Math.min(meses, MAX_ANTIGUEDAD),
  };
}

// ---------------------------------------------------------------------------
// Recalcular todos los scores (admin)
// ---------------------------------------------------------------------------

/**
 * Recalcula antigüedad para todos los participantes activos (o uno específico).
 * Solo inserta evento recalculo_manual si el score realmente cambió.
 *
 * Para cada participante:
 * 1. Calcula meses desde created_at hasta hoy
 * 2. Busca el último recalculo_manual en eventos_score
 * 3. Si hay meses nuevos no aplicados, suma la diferencia
 * 4. Si no hay cambio, skip
 */
export async function recalcularTodosLosScores(
  participanteId?: string,
): Promise<{ procesados: number }> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('participantes')
    .select('id, score_reputacion, created_at');

  if (participanteId) {
    query = query.eq('id', participanteId);
  } else {
    query = query.eq('activo', true);
  }

  const { data: rawParticipantes } = await query;

  const participantes = (rawParticipantes ?? []) as unknown as ParticipanteScore[];
  let procesados = 0;

  for (const p of participantes) {
    const meses = diffMeses(new Date(p.created_at), new Date());
    const antiguedadTotal = Math.min(meses, MAX_ANTIGUEDAD);

    // Check the last recalculo_manual event
    const { data: ultimoEvento } = await supabase
      .from('eventos_score')
      .select('score_nuevo, created_at')
      .eq('participante_id', p.id)
      .eq('tipo_evento', 'recalculo_manual')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimo = ultimoEvento as unknown as { score_nuevo: number; created_at: string } | null;

    // Calculate how many months of seniority have NOT been applied yet
    let mesesYaAplicados = 0;
    if (ultimo) {
      const mesesEnUltimoEvento = diffMeses(new Date(p.created_at), new Date(ultimo.created_at));
      mesesYaAplicados = Math.min(mesesEnUltimoEvento, MAX_ANTIGUEDAD);
    }

    const mesesNuevos = Math.min(
      Math.max(antiguedadTotal - mesesYaAplicados, 0),
      MAX_ANTIGUEDAD - mesesYaAplicados,
    );

    if (mesesNuevos <= 0) continue;

    const scoreAnterior = p.score_reputacion;
    const scoreNuevo = clamp(scoreAnterior + mesesNuevos, 0, 100);

    if (scoreNuevo === scoreAnterior) continue;

    // Insert recalculo_manual event
    await supabase
      .from('eventos_score')
      .insert({
        participante_id: p.id,
        tipo_evento: 'recalculo_manual',
        delta: mesesNuevos,
        score_anterior: scoreAnterior,
        score_nuevo: scoreNuevo,
        referencia_tipo: null,
        referencia_id: null,
      } as never);

    // Update participante
    await supabase
      .from('participantes')
      .update({ score_reputacion: scoreNuevo } as never)
      .eq('id', p.id);

    procesados++;
  }

  return { procesados };
}
