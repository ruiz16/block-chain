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
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import {
  CrearParticipanteSchema,
  CheckParticipanteQuerySchema,
} from '@/lib/validations/participantes';
import type { ParticipanteRow } from '@/types/database';
import { registrarReferido } from '@/lib/referidos/registry';

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

    const { nombre, email, wallet_address, rol, oficio, telefono } = validation.data;

    // ------------------------------------------------------------------
    // 2. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user } } = await serverClient.auth.getUser();

    // Fallback: Bearer token for mobile clients (no cookies)
    const bearerResult = !user ? await getBearerUser(request) : null;
    const authedUser = user ?? bearerResult?.user ?? null;

    // NOTE: userError from cookie auth is intentionally ignored here.
    // On cross-origin requests (mobile → web API), the cookie auth may fail
    // even when there's no actual error — the Bearer fallback is authoritative.
    if (!authedUser) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para completar el registro' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Check if user already has a participante row (created by SIWE)
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', authedUser.id)
      .maybeSingle();

    if (existing) {
      // Already has a placeholder — update with real data
      const { error: updateError } = await supabase
        .from('participantes')
        .update({
          nombre,
          wallet_address: wallet_address ? wallet_address.toLowerCase() : undefined,
          rol,
          oficio,
          telefono: telefono || undefined,
          email: email || '',
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[participantes] Error al actualizar participante:', updateError.message);

        return NextResponse.json(
          { error: 'ERROR_INTERNO', detail: 'Error al actualizar el perfil del participante' },
          { status: 500 },
        );
      }

      // Generate código de referido if not already set
      const codigoSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const codigoReferido = `MANGLE-${nombre.replace(/\s+/g, '').substring(0, 8).toUpperCase()}-${codigoSuffix}`;

      await supabase
        .from('participantes')
        .update({ codigo_referido: codigoReferido } as never)
        .eq('id', existing.id);

      return NextResponse.json(
        {
          id: existing.id,
          nombre,
          wallet_address: wallet_address || '',
          rol,
          telefono: telefono || '',
          user_id: authedUser.id,
          activo: true,
          codigo_referido: codigoReferido,
        },
        { status: 200 },
      );
    }

    // ------------------------------------------------------------------
    // 4. INSERT — first time registration
    // ------------------------------------------------------------------
      const { data: newParticipante, error: insertError } = await supabase
        .from('participantes')
        .insert({
          nombre,
          email: email || '',
          wallet_address: wallet_address ? wallet_address.toLowerCase() : '',  // Normalize to lowercase
          rol,
          oficio,
          user_id: authedUser.id,
          activo: true,
          score_reputacion: 50,  // Default starting score
          telefono: telefono || '',
        })
      .select()
      .single();

    if (insertError || !newParticipante) {
      console.error('[participantes] Error al insertar participante:', insertError?.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar el participante en la base de datos' },
        { status: 500 },
      );
    }

    const typedParticipante = newParticipante as unknown as ParticipanteRow;

    // ------------------------------------------------------------------
    // 4b. Generate unique código de referido
    // ------------------------------------------------------------------
    const codigoSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const codigoReferido = `MANGLE-${nombre.replace(/\s+/g, '').substring(0, 8).toUpperCase()}-${codigoSuffix}`;

    const { error: codigoError } = await supabase
      .from('participantes')
      .update({ codigo_referido: codigoReferido } as never)
      .eq('id', typedParticipante.id);

    if (codigoError) {
      console.warn('[participantes] Error al asignar código de referido:', codigoError.message);
    }

    // ------------------------------------------------------------------
    // 5b. If came with referrer code, register the referido (non-blocking)
    // ------------------------------------------------------------------
    if (codigo_referido) {
      registrarReferido({
        referidoId: typedParticipante.id,
        codigoReferido: codigo_referido,
      }).catch((err) => {
        console.warn('[participantes] Error al registrar referido:', err);
      });
    }

    // ------------------------------------------------------------------
    // 6. Return 201 with created row
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        id: typedParticipante.id,
        nombre: typedParticipante.nombre,
        wallet_address: typedParticipante.wallet_address,
        rol: typedParticipante.rol,
        telefono: typedParticipante.telefono,
        user_id: typedParticipante.user_id,
        activo: typedParticipante.activo,
        codigo_referido: codigoReferido,
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
    // 2. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const serverClient = getServerClient(request.cookies);
    const { data: { user } } = await serverClient.auth.getUser();

    // Fallback: Bearer token for mobile clients
    const bearerResult = !user ? await getBearerUser(request) : null;
    const authedUser = user ?? bearerResult?.user ?? null;

    if (!authedUser) {
      // Not authenticated — exists=false, not an error
      return NextResponse.json({ exists: false }, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. Check if user has a row
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();
    const { data: participante } = await supabase
      .from('participantes')
      .select('id, nombre, rol, wallet_address, gacc_id, validado_gacc')
      .eq('user_id', authedUser.id)
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
          id: participante.id,
          nombre: participante.nombre,
          rol: participante.rol,
          wallet_address: participante.wallet_address,
          gacc_id: participante.gacc_id,
          validado_gacc: participante.validado_gacc,
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
