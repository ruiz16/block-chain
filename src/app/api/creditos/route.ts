// =============================================================================
// GET  /api/creditos       — Listar mis créditos (authenticated user)
// POST /api/creditos       — Solicitar un nuevo crédito
// =============================================================================
//
// Follows the same auth pattern as /api/mis-creditos:
// - getServerUser(cookies) for session verification
// - Supabase service-role client for all DB operations
// - Zod validation at the boundary (400 on failure)
// - Audit log via registrarAuditLog
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { SolicitarCreditoSchema } from '@/lib/validations/creditos';
import { copToCusd, getCopUsdRate, INTERES_PORCENTAJE } from '@/config/currency';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------

interface ParticipanteRow {
  id: string;
  gacc_id?: string | null;
  validado_gacc?: boolean;
}

// =============================================================================
// POST /api/creditos — Solicitar Crédito
// =============================================================================

export async function POST(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para solicitar un crédito' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up participante by auth user_id
    // ------------------------------------------------------------------
    const { data: participante } = await supabase
      .from('participantes')
      .select('id, gacc_id, validado_gacc')
      .eq('user_id', user.id)
      .single();

    const typedParticipante = participante;

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante registrado' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 2b. GACC validation check
    // ------------------------------------------------------------------
    if (typedParticipante.gacc_id && !typedParticipante.validado_gacc) {
      return NextResponse.json(
        {
          error: 'GACC_NO_VALIDADO',
          detail: 'Debes ser validado por tu GACC antes de solicitar un crédito. Pide a otro miembro del grupo que te valide.',
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Parse and validate body via Zod
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CUERPO_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = SolicitarCreditoSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { monto: montoCop, descripcion, plazo_dias, numero_cuotas } = validation.data;

    // ------------------------------------------------------------------
    // 4. Save BOTH COP (original, for display) and cUSD (blockchain)
    // ------------------------------------------------------------------
    const tasaCambio = getCopUsdRate();
    const montoCusd = copToCusd(montoCop);
    const interesPorcentaje = INTERES_PORCENTAJE;

    const { data: nuevoCredito, error: insertError } = await supabase
      .from('creditos')
      .insert({
        prestatario_id: typedParticipante.id,
        monto: montoCusd.toString(),
        monto_cop: montoCop,
        tasa_cambio: tasaCambio,
        descripcion: descripcion ?? null,
        estado: 'pendiente',
        interes_porcentaje: interesPorcentaje,
        plazo_dias: plazo_dias,
        numero_cuotas: numero_cuotas,
      })
      .select()
      .single();

    if (insertError || !nuevoCredito) {
      console.error('[creditos] Error al insertar crédito:', insertError?.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar el crédito en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'credito_creado',
      entidadTipo: 'credito',
      entidadId: nuevoCredito.id,
      participanteId: typedParticipante.id,
      detalles: {
        monto: montoCusd,
        monto_cop: montoCop,
        tasa_cambio: tasaCambio,
        plazo_dias,
        numero_cuotas,
        interes_porcentaje: interesPorcentaje,
        descripcion: descripcion ?? null,
      },
    });

    // ------------------------------------------------------------------
    // 6. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'creado' as const,
        credito: nuevoCredito,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[creditos] Error inesperado en POST:', err);

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
// GET /api/creditos — Listar mis créditos
// =============================================================================

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

    const typedParticipante = participante;

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
      console.error('[creditos] Error al consultar créditos:', error.message);

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
    console.error('[creditos] Error inesperado en GET:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
