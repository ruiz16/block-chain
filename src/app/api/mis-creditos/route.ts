// =============================================================================
// GET /api/mis-creditos — List Credits
// =============================================================================
//
// Returns credits depending on the user's role:
//   - Admin:    Returns ALL credits in the system (no filter)
//   - Others:   Returns only credits where the user is the prestatario
//
// Auth flow:
// 1. Read session cookie via getServerUser()
// 2. Look up participante row by auth user_id (includes role)
// 3. If admin → query all creditos; otherwise filter by prestatario_id
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
  rol: string;
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
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para ver los créditos' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id (include role)
    // ------------------------------------------------------------------
    const { data: participante } = await supabase
      .from('participantes')
      .select('id, rol')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante as unknown as ParticipanteRow | null;

    if (!typedParticipante) {
      return NextResponse.json({ creditos: [] }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Query credits — admin sees ALL, others see only their own
    // ------------------------------------------------------------------
    const isAdmin = typedParticipante.rol === 'admin';

    let query = supabase
      .from('creditos')
      .select('*')
      .order('fecha_solicitud', { ascending: false });

    if (!isAdmin) {
      query = query.eq('prestatario_id', typedParticipante.id);
    }

    const { data: creditos, error } = await query;

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
