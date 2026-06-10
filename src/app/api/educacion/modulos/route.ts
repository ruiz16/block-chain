// =============================================================================
// GET /api/educacion/modulos — Obtener todos los módulos educativos
// =============================================================================
//
// Returns the education modules (lessons) ordered by step number.
// No auth required — content is public.
// =============================================================================

import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';

export async function GET(): Promise<Response> {
  try {
    const supabase = getSupabaseClient();

    const { data: modulos, error } = await supabase
      .from('modulos_educativos')
      .select('*')
      .order('orden', { ascending: true });

    if (error) {
      console.error('[educacion/modulos] Error al obtener módulos:', error.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al obtener los módulos educativos' },
        { status: 500 },
      );
    }

    return NextResponse.json({ modulos }, { status: 200 });
  } catch (err) {
    console.error('[educacion/modulos] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
