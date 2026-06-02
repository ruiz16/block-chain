// =============================================================================
// sender.ts — Procesador de cola de emails (STUB)
// =============================================================================
//
// Por ahora solo loguea a consola y marca como enviado.
// Cuando se integre con un provider (SendGrid, Resend, etc.),
// solo se cambia la función enviarEmail().
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

async function enviarEmail(para: string, asunto: string, cuerpoHtml: string): Promise<void> {
  // STUB: loguear a consola
  console.log('[email] Enviando email a', para);
  console.log('[email] Asunto:', asunto);
  console.log('[email] Cuerpo:', cuerpoHtml.substring(0, 200) + '...');

  // TODO: Integrar con SendGrid/Resend aquí
  // Ej: await sendgrid.send({ to: para, subject: asunto, html: cuerpoHtml });
}

export async function procesarCola(): Promise<{ procesados: number; fallidos: number }> {
  const supabase = getSupabaseClient();

  const { data: rawPendientes } = await supabase
    .from('cola_email')
    .select('id, para, asunto, cuerpo_html')
    .eq('estado', 'pendiente')
    .limit(50);

  const pendientes = rawPendientes as unknown as { id: string; para: string; asunto: string; cuerpo_html: string }[] | null;

  if (!pendientes || pendientes.length === 0) {
    return { procesados: 0, fallidos: 0 };
  }

  let procesados = 0;
  let fallidos = 0;

  for (const email of pendientes) {
    try {
      await enviarEmail(email.para, email.asunto, email.cuerpo_html);

      await supabase
        .from('cola_email')
        .update({ estado: 'enviado', enviado_at: new Date().toISOString() } as never)
        .eq('id', email.id);

      procesados++;
    } catch (err) {
      await supabase
        .from('cola_email')
        .update({ estado: 'fallido', error: String(err) } as never)
        .eq('id', email.id);

      fallidos++;
    }
  }

  return { procesados, fallidos };
}
