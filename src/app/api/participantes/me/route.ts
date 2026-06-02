// =============================================================================
// GET  /api/participantes/me   — Get current user's profile
// PATCH /api/participantes/me  — Update current user's profile (wallet, name)
// =============================================================================
//
// Both endpoints require an active session and an existing participante row.
//
// GET  → returns the participante row (nombre, wallet_address, rol, etc.)
// PATCH → body: { nombre?, wallet_address? }
//         updates only the provided fields on the current user's row
//
// Follows the existing API route pattern:
// - Zod validation at the boundary (400 on failure)
// - Session-based auth (server-side cookie read)
// - Service-role client for DB operations
// - Spanish error codes
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerClient } from '@/lib/supabase/auth-server';
import type { Database } from '@/types/supabase';
import { ActualizarParticipanteSchema } from '@/lib/validations/participantes';

// =============================================================================
// GET /api/participantes/me — Obtener perfil del usuario actual
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user }, error: userError } = await serverClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Fetch participante row
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: participante, error: fetchError } = await supabase
      .from('participantes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('[participantes/me] Error al obtener perfil:', fetchError.message);
      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al obtener el perfil' },
        { status: 500 },
      );
    }

    if (!participante) {
      return NextResponse.json(
        { error: 'PERFIL_NO_ENCONTRADO', detail: 'Completá el onboarding primero' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Return profile
    // ------------------------------------------------------------------
    return NextResponse.json(
      { participante },
      { status: 200 },
    );
  } catch (err) {
    console.error('[participantes/me] Error inesperado en GET:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}

// =============================================================================
// PATCH /api/participantes/me — Actualizar perfil
// =============================================================================

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse and validate body
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CUERPO_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = ActualizarParticipanteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { nombre, wallet_address } = validation.data;

    // Check that at least one field was provided
    if (nombre === undefined && wallet_address === undefined) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: 'Debes proporcionar al menos un campo para actualizar' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Verify session
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user }, error: userError } = await serverClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Build update payload (only provided fields)
    // ------------------------------------------------------------------
    const updateData: Partial<Database['public']['Tables']['participantes']['Update']> = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (wallet_address !== undefined) updateData.wallet_address = wallet_address;

    // ------------------------------------------------------------------
    // 4. Update participante row (scoped to current user via user_id)
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: updated, error: updateError } = await supabase
      .from('participantes')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      console.error('[participantes/me] Error al actualizar perfil:', updateError?.message);

      if (updateError?.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'PERFIL_NO_ENCONTRADO', detail: 'Completá el onboarding primero' },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al actualizar el perfil' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Return updated profile
    // ------------------------------------------------------------------
    return NextResponse.json(
      { participante: updated },
      { status: 200 },
    );
  } catch (err) {
    console.error('[participantes/me] Error inesperado en PATCH:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
