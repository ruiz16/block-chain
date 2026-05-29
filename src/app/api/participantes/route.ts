// =============================================================================
// GET  /api/participantes          — Check if current user has a profile
// POST /api/participantes          — Create a new participant (onboarding)
// =============================================================================
//
// GET  ?check_existing=true        — Returns { exists, participante? }
// POST body { nombre, wallet_address?, rol } — Creates row with user_id from session
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
import {
  CrearParticipanteSchema,
  CheckParticipanteQuerySchema,
} from '@/lib/validations/participantes';
import type { ParticipanteRow } from '@/types/database';

// =============================================================================
// POST /api/participantes — Crear Participante (Onboarding)
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
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

    const validation = CrearParticipanteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { nombre, wallet_address, rol } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session server-side
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user }, error: userError } = await serverClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para completar el registro' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Check if user already has a participantes row
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'USUARIO_YA_REGISTRADO', detail: 'Este usuario ya tiene un perfil de participante' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 4. INSERT using service-role client
    // ------------------------------------------------------------------
    const { data: newParticipante, error: insertError } = await supabase
      .from('participantes')
      .insert({
        nombre,
        wallet_address: wallet_address || '',  // Use empty string if not provided
        rol,
        user_id: user.id,
        activo: true,
        score_reputacion: 50,  // Default starting score
      } as never)
      .select()
      .single();

    if (insertError || !newParticipante) {
      console.error('[participantes] Error al insertar participante:', insertError?.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar el participante en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Return 201 with created row
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        id: (newParticipante as unknown as ParticipanteRow).id,
        nombre: (newParticipante as unknown as ParticipanteRow).nombre,
        wallet_address: (newParticipante as unknown as ParticipanteRow).wallet_address,
        rol: (newParticipante as unknown as ParticipanteRow).rol,
        user_id: (newParticipante as unknown as ParticipanteRow).user_id,
        activo: (newParticipante as unknown as ParticipanteRow).activo,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[participantes] Error inesperado en POST:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}

// =============================================================================
// GET /api/participantes — Check if user has a profile
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Parse query params
    // ------------------------------------------------------------------
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const validation = CheckParticipanteQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'PARAMETROS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Parámetros de consulta inválidos',
        },
        { status: 400 },
      );
    }

    // Only respond to ?check_existing=true for now
    if (!validation.data.check_existing) {
      return NextResponse.json(
        { error: 'PARAMETROS_INVALIDOS', detail: 'Parámetro check_existing requerido' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Verify session
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user }, error: userError } = await serverClient.auth.getUser();

    if (userError || !user) {
      // Not authenticated — exists=false, not an error
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Check if user has a row
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: participante } = await supabase
      .from('participantes')
      .select('id, nombre, rol, wallet_address')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!participante) {
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 4. Return existing profile
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        exists: true,
        participante: {
          id: (participante as unknown as { id: string; nombre: string; rol: string; wallet_address: string }).id,
          nombre: (participante as unknown as { id: string; nombre: string; rol: string; wallet_address: string }).nombre,
          rol: (participante as unknown as { id: string; nombre: string; rol: string; wallet_address: string }).rol,
          wallet_address: (participante as unknown as { id: string; nombre: string; rol: string; wallet_address: string }).wallet_address,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[participantes] Error inesperado en GET:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
