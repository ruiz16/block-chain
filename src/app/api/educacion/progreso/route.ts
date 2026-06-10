// =============================================================================
// GET  /api/educacion/progreso  — Obtener progreso del participante
// POST /api/educacion/progreso  — Avanzar al siguiente módulo
// =============================================================================
//
// GET  → returns { progreso: { modulo_actual, completado, modulos_totales } | null }
// POST → body: { modulo_actual: number }
//         advances the user's progress to the given step
//         returns { progreso: { modulo_actual, completado, modulos_totales } }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { cookies } from 'next/headers';

// =============================================================================
// GET /api/educacion/progreso
// =============================================================================

export async function GET(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;
    let participante: { id: string } | null = bearerResult?.participante ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante
    // ------------------------------------------------------------------
    if (!participante) {
      const { data: raw } = await supabase
        .from('participantes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      participante = raw;
    }

    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Count total modules
    // ------------------------------------------------------------------
    const { count: modulosTotales } = await supabase
      .from('modulos_educativos')
      .select('*', { count: 'exact', head: true });

    // ------------------------------------------------------------------
    // 4. Fetch or create progress
    // ------------------------------------------------------------------
    const { data: progreso } = await supabase
      .from('progreso_educacion')
      .select('modulo_actual, completado')
      .eq('participante_id', participante.id)
      .maybeSingle();

    if (!progreso) {
      // Create initial progress row
      const { data: nuevo } = await supabase
        .from('progreso_educacion')
        .insert({ participante_id: participante.id })
        .select('modulo_actual, completado')
        .single();

      return NextResponse.json(
        {
          progreso: nuevo
            ? { ...nuevo, modulos_totales: modulosTotales ?? 0 }
            : { modulo_actual: 1, completado: false, modulos_totales: modulosTotales ?? 0 },
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { progreso: { ...progreso, modulos_totales: modulosTotales ?? 0 } },
      { status: 200 },
    );
  } catch (err) {
    console.error('[educacion/progreso] Error inesperado en GET:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/educacion/progreso  — Avanzar al módulo indicado
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;
    let participante: { id: string } | null = bearerResult?.participante ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante
    // ------------------------------------------------------------------
    if (!participante) {
      const { data: raw } = await supabase
        .from('participantes')
        .select('id')
        .eq('user_id', user.id)
        .single();

      participante = raw;
    }

    if (!participante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Parse body
    // ------------------------------------------------------------------
    const body: { modulo_actual?: number } = await request.json().catch(() => ({}));
    const moduloActual = body.modulo_actual;

    if (typeof moduloActual !== 'number' || moduloActual < 1) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: 'modulo_actual debe ser un número >= 1' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Count total modules
    // ------------------------------------------------------------------
    const { count: modulosTotales } = await supabase
      .from('modulos_educativos')
      .select('*', { count: 'exact', head: true });

    const total = modulosTotales ?? 0;
    const completado = moduloActual >= total;

    // ------------------------------------------------------------------
    // 5. Upsert progress
    // ------------------------------------------------------------------
    const { data: progreso, error: upsertError } = await supabase
      .from('progreso_educacion')
      .upsert(
        {
          participante_id: participante.id,
          modulo_actual: completado ? total : moduloActual,
          completado,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: 'participante_id' },
      )
      .select('modulo_actual, completado')
      .single();

    if (upsertError) {
      console.error('[educacion/progreso] Error al guardar progreso:', upsertError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al guardar el progreso educativo' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { progreso: { ...progreso, modulos_totales: total } },
      { status: 200 },
    );
  } catch (err) {
    console.error('[educacion/progreso] Error inesperado en POST:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
