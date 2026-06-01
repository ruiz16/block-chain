// =============================================================================
// score-red.ts — Cálculo de score colectivo de red
// =============================================================================
//
// Recalcula el score de red como promedio de scores efectivos de todos
// los miembros. Se ejecuta como side-effect no-bloqueante.
//
// Acepta participanteId y busca la red internamente para simplificar
// la integración desde los handlers de pago.
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import { scoreEfectivo } from '@/lib/score/calculator';
import { notificarARed } from '@/lib/notificaciones/service';

export async function recalcularScoreRed(participanteId: string): Promise<number> {
  const supabase = getSupabaseClient();

  // 1. Buscar red del participante
  const { data: rawMiembro } = await supabase
    .from('red_miembros')
    .select('red_id')
    .eq('participante_id', participanteId)
    .single();

  const miembro = rawMiembro as unknown as { red_id: string } | null;
  if (!miembro) return 0; // No tiene red

  const redId = miembro.red_id;

  // 2. Obtener miembros con sus scores
  const { data: rawMiembros } = await supabase
    .from('red_miembros')
    .select(`
      participante_id,
      participante:participantes!red_miembros_participante_id_fkey(
        score_reputacion,
        created_at
      )
    `)
    .eq('red_id', redId);

  const miembros = rawMiembros as unknown as {
    participante_id: string;
    participante: { score_reputacion: number; created_at: string } | { score_reputacion: number; created_at: string }[];
  }[] | null;

  if (!miembros || miembros.length === 0) return 0;

  // 3. Calcular promedio de scores efectivos
  let suma = 0;
  for (const m of miembros) {
    const rawP = m.participante;
    const p = Array.isArray(rawP) ? rawP[0] : rawP;
    if (p) {
      suma += scoreEfectivo(p.score_reputacion, p.created_at);
    }
  }

  const nuevoScore = Math.round(suma / miembros.length);

  // 4. Obtener score anterior
  const { data: rawRed } = await supabase
    .from('redes_apoyo')
    .select('score_red, estado')
    .eq('id', redId)
    .single();

  const red = rawRed as unknown as { score_red: number; estado: string } | null;

  // 5. Actualizar en DB
  await supabase
    .from('redes_apoyo')
    .update({ score_red: nuevoScore } as never)
    .eq('id', redId);

  // 6. Notificar si hubo cambio significativo
  if (red && red.score_red !== nuevoScore) {
    const diferencia = nuevoScore - red.score_red;
    if (diferencia > 0) {
      await notificarARed({
        redId,
        tipo: 'score_red_mejoro',
        titulo: 'Score de red mejoró',
        cuerpo: `El score de tu red de apoyo subió de ${red.score_red} a ${nuevoScore}. ¡Sigan así!`,
      });
    } else {
      await notificarARed({
        redId,
        tipo: 'score_red_empeoro',
        titulo: 'Score de red disminuyó',
        cuerpo: `El score de tu red de apoyo bajó de ${red.score_red} a ${nuevoScore}. Recuerden que juntas se apoyan para mantener un buen historial.`,
      });
    }
  }

  return nuevoScore;
}
