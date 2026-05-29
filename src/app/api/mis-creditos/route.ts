// =============================================================================
// GET /api/mis-creditos — List Borrower's Credits
// =============================================================================
//
// Returns all credits where the authenticated user is the prestatario.
// Uses Supabase Auth session to identify the user and joins via
// participantes.user_id.
//
// Auth flow:
// 1. Read session cookie via getServerUser()
// 2. Look up participante row by auth user_id
// 3. Query creditos WHERE prestatario_id = participante.id
// 4. Return { creditos: CreditoRow[] }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface ParticipanteRow {
  id: string;
}

export async function GET(): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para ver tus créditos' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id
    // ------------------------------------------------------------------
    const { data: participante } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante as unknown as ParticipanteRow | null;

    if (!typedParticipante) {
      // User has no participante row — return empty array
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Query all credits for this participante
    // ------------------------------------------------------------------
    const { data: creditos, error } = await supabase
      .from('creditos')
      .select('*')
      .eq('prestatario_id', typedParticipante.id)
      .order('fecha_solicitud', { ascending: false });

    if (error) {
      console.error('[mis-creditos] Error al consultar créditos:', error.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar créditos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Return credits
    // ------------------------------------------------------------------
    return NextResponse.json({ creditos: creditos ?? [] }, { status: 200 });
  } catch (err) {
    console.error('[mis-creditos] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
