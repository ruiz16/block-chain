// =============================================================================
// cola.ts — Cola de emails diferidos
// =============================================================================
//
// Encola emails para procesamiento asíncrono por el admin.
// El envío real se hace en sender.ts (procesarCola).
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

export async function encolarEmail(params: {
  para: string;
  asunto: string;
  cuerpoHtml: string;
}): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('cola_email')
    .insert({
      para: params.para,
      asunto: params.asunto,
      cuerpo_html: params.cuerpoHtml,
    } as never);

  if (error) {
    console.warn('[email] Error al encolar:', error.message);
  }
}
