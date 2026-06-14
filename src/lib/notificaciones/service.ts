// =============================================================================
// service.ts — Creación de notificaciones in-app
// =============================================================================
//
// Crea notificaciones individuales o masivas (a toda una red).
// Se usa como side-effect desde otros servicios (semaforo, score-red, etc.).
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

export type TipoNotificacion =
  // Heredados (modelo referidos/redes)
  | 'bienvenida_red'
  | 'score_red_mejoro'
  | 'score_red_empeoro'
  | 'alerta_48h'
  | 'alerta_7d'
  | 'referido_nuevo'
  // Modelo GACC
  | 'aval_requerido'        // a la referadora: "Avalá a Juan"
  | 'aval_lider_requerido'  // al líder social: falta tu aval 2/2
  | 'mora_referadora'       // a la referadora del crédito en mora
  | 'mora_lider'            // al líder social del GACC con mora
  | 'gacc_restringido';     // al grupo: score bajo → restricciones

export async function crearNotificacion(params: {
  participanteId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('notificaciones')
    .insert({
      participante_id: params.participanteId,
      tipo: params.tipo,
      titulo: params.titulo,
      cuerpo: params.cuerpo,
    } as never);

  if (error) {
    console.warn('[notificaciones] Error al crear notificación:', error.message);
  }
}

export async function notificarARed(params: {
  redId: string;
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: miembros } = await supabase
    .from('red_miembros')
    .select('participante_id')
    .eq('red_id', params.redId);

  const rows = miembros as unknown as { participante_id: string }[] | null;

  if (!rows || rows.length === 0) return;

  for (const miembro of rows) {
    await crearNotificacion({
      participanteId: miembro.participante_id,
      tipo: params.tipo,
      titulo: params.titulo,
      cuerpo: params.cuerpo,
    });
  }
}
