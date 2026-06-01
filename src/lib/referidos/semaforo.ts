// =============================================================================
// semaforo.ts — Verificador de atrasos y semáforo comunitario
// =============================================================================
//
// Se ejecuta como side-effect no-bloqueante después de cada pago.
// Evalúa si hay miembros de la red con cuotas vencidas y actualiza
// el estado de la red (verde/amarillo/rojo).
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import { notificarARed } from '@/lib/notificaciones/service';
import { encolarEmail } from '@/lib/email/cola';

export async function verificarAtrasosRed(participanteId: string): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Obtener red del participante
  const { data: rawMiembro } = await supabase
    .from('red_miembros')
    .select('red_id')
    .eq('participante_id', participanteId)
    .single();

  const miembro = rawMiembro as unknown as { red_id: string } | null;
  if (!miembro) return; // No tiene red

  const redId = miembro.red_id;

  // 2. Obtener todos los miembros de la red
  const { data: rawMiembros } = await supabase
    .from('red_miembros')
    .select('participante_id')
    .eq('red_id', redId);

  const miembros = rawMiembros as unknown as { participante_id: string }[] | null;
  if (!miembros || miembros.length === 0) return;

  const miembroIds = miembros.map(m => m.participante_id);

  // 3. Buscar cuotas vencidas no pagadas de estos miembros
  const ahora = new Date();
  const hace48h = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const hace7d = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Buscar creditos de estos miembros
  const { data: rawCreditos } = await supabase
    .from('creditos')
    .select('id')
    .in('prestatario_id', miembroIds);

  const creditos = rawCreditos as unknown as { id: string }[] | null;
  const creditoIds = creditos?.map(c => c.id) ?? [];

  if (creditoIds.length === 0) {
    // Sin créditos → sin atrasos → verde
    await actualizarEstadoRed(redId, 'verde');
    return;
  }

  const { data: rawCuotas } = await supabase
    .from('cuotas')
    .select('id, fecha_vencimiento, estado')
    .in('credito_id', creditoIds)
    .in('estado', ['pendiente', 'vencida']);

  const cuotasVencidas = rawCuotas as unknown as { id: string; fecha_vencimiento: string; estado: string }[] | null;

  if (!cuotasVencidas || cuotasVencidas.length === 0) {
    // Sin cuotas vencidas → verde
    await actualizarEstadoRed(redId, 'verde');
    return;
  }

  // 4. Evaluar el peor caso
  const tieneAtrasoMayorA7d = cuotasVencidas.some(
    c => new Date(c.fecha_vencimiento) < hace7d,
  );

  const tieneAtrasoMayorA48h = cuotasVencidas.some(
    c => new Date(c.fecha_vencimiento) < hace48h,
  );

  if (tieneAtrasoMayorA7d) {
    await actualizarEstadoRed(redId, 'rojo');
    await notificarARed({
      redId,
      tipo: 'alerta_7d',
      titulo: 'Alerta: Atraso prolongado en tu red',
      cuerpo: 'Una compañera de tu red tiene más de 7 días de atraso. El acceso a nuevos créditos está temporalmente restringido hasta que se regularice la situación.',
    });

    // Encolar email a la referidora
    const { data: rawRef } = await supabase
      .from('red_miembros')
      .select('participante_id')
      .eq('red_id', redId)
      .eq('es_referidora', true)
      .single();

    const referidora = rawRef as unknown as { participante_id: string } | null;
    if (referidora) {
      const { data: rawP } = await supabase
        .from('participantes')
        .select('email')
        .eq('id', referidora.participante_id)
        .single();
      const email = (rawP as unknown as { email: string } | null)?.email;
      if (email) {
        await encolarEmail({
          para: email,
          asunto: 'Alerta: Tu red de apoyo necesita atención',
          cuerpoHtml: `<p>Una compañera de tu red tiene más de 7 días de atraso.</p><p>Por favor contacta a tu Embajadora Digital para activar el protocolo de contingencia.</p>`,
        });
      }
    }
  } else if (tieneAtrasoMayorA48h) {
    await actualizarEstadoRed(redId, 'amarillo');
    await notificarARed({
      redId,
      tipo: 'alerta_48h',
      titulo: 'Alerta de Apoyo',
      cuerpo: 'Una compañera de tu red presenta un retraso en su cuota. Como su red de apoyo, te invitamos a activar los lazos comunitarios. Si la ayudas a ponerse al día o a contactar a su Embajadora Digital, el puntaje de tu red se mantendrá intacto.',
    });
  }
}

async function actualizarEstadoRed(redId: string, nuevoEstado: 'verde' | 'amarillo' | 'rojo'): Promise<void> {
  const supabase = getSupabaseClient();

  // Solo actualizar si cambió
  const { data: rawActual } = await supabase
    .from('redes_apoyo')
    .select('estado')
    .eq('id', redId)
    .single();

  const actual = rawActual as unknown as { estado: string } | null;

  if (actual && actual.estado === nuevoEstado) return; // No cambió

  await supabase
    .from('redes_apoyo')
    .update({ estado: nuevoEstado } as never)
    .eq('id', redId);
}
