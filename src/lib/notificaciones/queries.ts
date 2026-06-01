// =============================================================================
// queries.ts — Consultas de notificaciones
// =============================================================================
//
// Funciones para listar, marcar como leída y contar notificaciones.
// Se usan desde las APIs de notificaciones.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  created_at: string;
}

export async function listarNotificaciones(
  participanteId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ notificaciones: Notificacion[]; total: number }> {
  const supabase = getSupabaseClient();

  const { data: rawNotifs, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, titulo, cuerpo, leida, created_at', { count: 'exact' })
    .eq('participante_id', participanteId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.warn('[notificaciones] Error al listar:', error.message);
    return { notificaciones: [], total: 0 };
  }

  const notificaciones = (rawNotifs ?? []) as unknown as Notificacion[];

  // Second query for total count (Supabase count with range is unreliable)
  const { count } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('participante_id', participanteId);

  return {
    notificaciones,
    total: count ?? notificaciones.length,
  };
}

export async function marcarLeida(
  notificacionId: string,
  participanteId: string,
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true } as never)
    .eq('id', notificacionId)
    .eq('participante_id', participanteId); // ownership check

  if (error) {
    throw new Error('NOTIFICACION_NO_ENCONTRADA');
  }
}

export async function contarNoLeidas(participanteId: string): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('participante_id', participanteId)
    .eq('leida', false);

  if (error) return 0;
  return count ?? 0;
}
