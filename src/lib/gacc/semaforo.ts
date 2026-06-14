// =============================================================================
// semaforo.ts — Semáforo de Riesgo Colectivo y penalización del GACC
// =============================================================================
//
// Modelo GACC (Especificación de Arquitectura §4):
//  - Semáforo por atrasos: verde / amarillo (>48h) / rojo (>7 días) según la
//    mora máxima de las cuotas activas del grupo.
//  - Notificaciones privadas de mora: a la referadora del crédito moroso y al
//    Líder Social del GACC (responsable de la gobernanza del grupo).
//  - Penalización colectiva: si score_gacc cae por debajo del umbral, el grupo
//    pasa a 'restringido' (bloquea nuevas solicitudes y reduce beneficios).
//
// Opera sobre los miembros del GACC (participantes.gacc_id) — NO sobre las
// tablas heredadas redes_apoyo/red_miembros.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

export type SemaforoEstado = 'verde' | 'amarillo' | 'rojo';

// Umbrales de mora (días)
export const DIAS_MORA_AMARILLO = 2; // > 48h
export const DIAS_MORA_ROJO = 7; // > 7 días

// Score grupal mínimo antes de aplicar restricciones colectivas
export const UMBRAL_SCORE_GACC = 40;

export interface SemaforoResultado {
  estado: SemaforoEstado;
  maxDiasMora: number;
  cuotasVencidas: number;
  creditosEnMora: number;
}

function diasDesde(fechaIso: string): number {
  const ms = Date.now() - new Date(fechaIso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Deriva el color del semáforo a partir de los días de mora máximos. */
export function clasificarSemaforo(maxDiasMora: number): SemaforoEstado {
  if (maxDiasMora > DIAS_MORA_ROJO) return 'rojo';
  if (maxDiasMora > DIAS_MORA_AMARILLO) return 'amarillo';
  return 'verde';
}

/**
 * Evalúa el semáforo de mora del grupo (solo lectura): calcula la mora máxima de
 * las cuotas activas y deriva el color verde/amarillo/rojo. No genera avisos
 * (flujo pull: el semáforo se muestra en la UI al entrar a /gacc).
 */
export async function evaluarSemaforoGacc(
  grupoId: string,
): Promise<SemaforoResultado> {
  const supabase = getSupabaseClient();

  // Miembros activos del grupo
  const { data: rawMiembros } = await supabase
    .from('participantes')
    .select('id')
    .eq('gacc_id', grupoId)
    .eq('activo', true);
  const miembroIds = (rawMiembros ?? []).map((m: { id: string }) => m.id);

  if (miembroIds.length === 0) {
    return { estado: 'verde', maxDiasMora: 0, cuotasVencidas: 0, creditosEnMora: 0 };
  }

  // Créditos desembolsados de esos miembros
  const { data: rawCreditos } = await supabase
    .from('creditos')
    .select('id, prestatario_id, referadora_id')
    .in('prestatario_id', miembroIds)
    .eq('estado', 'desembolsado');
  const creditos = (rawCreditos ?? []) as unknown as {
    id: string;
    prestatario_id: string;
    referadora_id: string | null;
  }[];

  if (creditos.length === 0) {
    return { estado: 'verde', maxDiasMora: 0, cuotasVencidas: 0, creditosEnMora: 0 };
  }

  const creditoIds = creditos.map((c) => c.id);
  const nowIso = new Date().toISOString();

  // Cuotas vencidas no pagadas
  const { data: rawCuotas } = await supabase
    .from('cuotas')
    .select('id, credito_id, fecha_vencimiento, estado')
    .in('credito_id', creditoIds)
    .neq('estado', 'pagada')
    .lt('fecha_vencimiento', nowIso);
  const cuotas = (rawCuotas ?? []) as unknown as {
    id: string;
    credito_id: string;
    fecha_vencimiento: string;
    estado: string;
  }[];

  let maxDiasMora = 0;
  const creditosEnMora = new Set<string>();
  for (const cuota of cuotas) {
    const dias = diasDesde(cuota.fecha_vencimiento);
    if (dias > maxDiasMora) maxDiasMora = dias;
    creditosEnMora.add(cuota.credito_id);
  }

  const estado = clasificarSemaforo(maxDiasMora);

  return {
    estado,
    maxDiasMora,
    cuotasVencidas: cuotas.length,
    creditosEnMora: creditosEnMora.size,
  };
}

/**
 * Recalcula score_gacc (vía RPC de la migration 031) y aplica la penalización
 * colectiva:
 *  - score < UMBRAL_SCORE_GACC → estado 'restringido' (+ notifica al líder)
 *  - score ≥ UMBRAL y estaba 'restringido' → vuelve a 'activo'
 *
 * @returns el nuevo score y estado del grupo.
 */
export async function recalcularScoreGacc(
  grupoId: string,
): Promise<{ score: number; estado: string }> {
  const supabase = getSupabaseClient();

  // 1. Recalcular score vía función SQL (migration 031)
  const { data: rpcData, error: rpcError } = await supabase.rpc('recalcular_score_gacc', {
    grupo: grupoId,
  });

  if (rpcError) {
    console.warn('[gacc/semaforo] Error en recalcular_score_gacc:', rpcError.message);
  }

  const score = Number(rpcData ?? 0);

  // 2. Estado actual del grupo
  const { data: rawGrupo } = await supabase
    .from('grupos_gacc')
    .select('id, estado, lider_id')
    .eq('id', grupoId)
    .single();
  const grupo = rawGrupo as unknown as
    | { id: string; estado: string; lider_id: string | null }
    | null;

  if (!grupo) return { score, estado: 'activo' };

  // 3. Penalización colectiva
  let nuevoEstado = grupo.estado;

  if (score < UMBRAL_SCORE_GACC && grupo.estado === 'activo') {
    nuevoEstado = 'restringido';
    await supabase
      .from('grupos_gacc')
      .update({ estado: 'restringido' } as never)
      .eq('id', grupoId);
  } else if (score >= UMBRAL_SCORE_GACC && grupo.estado === 'restringido') {
    nuevoEstado = 'activo';
    await supabase
      .from('grupos_gacc')
      .update({ estado: 'activo' } as never)
      .eq('id', grupoId);
  }

  return { score, estado: nuevoEstado };
}
