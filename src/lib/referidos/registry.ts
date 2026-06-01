// =============================================================================
// registry.ts — Registro de referidos y asignación a red
// =============================================================================
//
// Se llama durante el onboarding cuando un nuevo participante se registra
// con un código de referido. Crea el vínculo en la tabla referidos y asigna
// al nuevo miembro a la red del referidor (creando la red si es necesario).
// =============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';

interface RegistroResult {
  redId: string;
  esNuevaRed: boolean;
}

export async function registrarReferido(params: {
  referidoId: string;
  codigoReferido: string;
}): Promise<RegistroResult> {
  const supabase = getSupabaseClient();

  // 1. Buscar quien es dueño del código
  const { data: rawReferidor } = await supabase
    .from('participantes')
    .select('id, nombre')
    .eq('codigo_referido', params.codigoReferido)
    .single();

  const referidor = rawReferidor as unknown as { id: string; nombre: string } | null;

  if (!referidor) {
    throw new Error('CODIGO_REFERIDO_INVALIDO');
  }

  // 2. Validar que no sea autorreferencia
  if (referidor.id === params.referidoId) {
    throw new Error('AUTORREFERENCIA_INVALIDA');
  }

  // 3. Insertar referido
  const { error: refError } = await supabase
    .from('referidos')
    .insert({
      referidor_id: referidor.id,
      referido_id: params.referidoId,
    } as never);

  if (refError) {
    throw new Error(`ERROR_AL_REGISTRAR_REFERIDO: ${refError.message}`);
  }

  // 4. Buscar red del referidor
  const { data: rawMiembro } = await supabase
    .from('red_miembros')
    .select('red_id')
    .eq('participante_id', referidor.id)
    .single();

  const miembroExistente = rawMiembro as unknown as { red_id: string } | null;

  let redId: string;
  let esNuevaRed = false;

  if (!miembroExistente) {
    // 5. Crear nueva red con el referidor como primer miembro
    const { data: rawRed, error: redError } = await supabase
      .from('redes_apoyo')
      .insert({
        nombre: `Red de ${referidor.nombre}`,
      } as never)
      .select('id')
      .single();

    const nuevaRed = rawRed as unknown as { id: string } | null;
    if (redError || !nuevaRed) throw new Error('ERROR_CREANDO_RED');

    redId = nuevaRed.id;
    esNuevaRed = true;

    // Insertar referidor como es_referidora
    await supabase.from('red_miembros').insert({
      red_id: redId,
      participante_id: referidor.id,
      es_referidora: true,
    } as never);
  } else {
    redId = miembroExistente.red_id;
  }

  // 6. Insertar nuevo miembro en la red
  const { error: miembroError } = await supabase
    .from('red_miembros')
    .insert({
      red_id: redId,
      participante_id: params.referidoId,
    } as never);

  if (miembroError) throw new Error('ERROR_ASIGNANDO_RED');

  return { redId, esNuevaRed };
}
