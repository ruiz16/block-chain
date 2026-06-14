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
import { getBearerUser, PARTICIPANTE_AUTH_SELECT } from '@/lib/supabase/auth-bearer';
import { SolicitarCreditoSchema } from '@/lib/validations/creditos';
import { INTERES_PORCENTAJE } from '@/config/currency';
import type { EstadoCredito } from '@/types/database';
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
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

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
    let typedParticipante = bearerResult?.participante ?? null;
    if (!typedParticipante) {
      const { data: participante } = await supabase
        .from('participantes')
        .select(PARTICIPANTE_AUTH_SELECT)
        .eq('user_id', user.id)
        .single();

      typedParticipante = participante;
    }

    if (!typedParticipante) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante registrado' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 2b. GACC validation check — AHORA OBLIGATORIO
    // ------------------------------------------------------------------
    if (!typedParticipante.gacc_id) {
      return NextResponse.json(
        {
          error: 'SIN_GACC',
          detail: 'Debes pertenecer a un GACC para solicitar un crédito. Crea o únete a un grupo desde la sección GACC.',
        },
        { status: 403 },
      );
    }

    if (!typedParticipante.validado_gacc) {
      return NextResponse.json(
        {
          error: 'GACC_NO_VALIDADO',
          detail: 'Debes ser validado por tu GACC antes de solicitar un crédito. Pide a otro miembro del grupo que te valide.',
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2b-bis. GACC no debe estar restringido (penalización colectiva)
    // ------------------------------------------------------------------
    const { data: rawGrupoEstado } = await supabase
      .from('grupos_gacc')
      .select('estado')
      .eq('id', typedParticipante.gacc_id)
      .maybeSingle();

    const grupoEstado = (rawGrupoEstado as { estado?: string } | null)?.estado;

    if (grupoEstado === 'restringido') {
      return NextResponse.json(
        {
          error: 'GACC_RESTRINGIDO',
          detail: 'Tu GACC está restringido por bajo puntaje colectivo. No puede solicitar nuevos créditos hasta recuperar el score.',
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2c. Education completion check
    // ------------------------------------------------------------------
    const { data: edu } = await supabase
      .from('progreso_educacion')
      .select('completado')
      .eq('participante_id', typedParticipante.id)
      .maybeSingle();

    if (!edu?.completado) {
      return NextResponse.json(
        {
          error: 'EDUCACION_INCOMPLETA',
          detail: 'Completa el módulo educativo antes de solicitar un crédito.',
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 2d. Active credit check — one credit at a time
    // ------------------------------------------------------------------
    const ESTADOS_ACTIVOS: EstadoCredito[] = ['pendiente', 'avalado', 'aprobado', 'desembolsado'];

    const { data: creditoActivo } = await supabase
      .from('creditos')
      .select('id, estado')
      .eq('prestatario_id', typedParticipante.id)
      .in('estado', ESTADOS_ACTIVOS)
      .limit(1)
      .maybeSingle();

    if (creditoActivo) {
      return NextResponse.json(
        {
          error: 'CREDITO_ACTIVO',
          detail: `Ya tienes un crédito en estado "${creditoActivo.estado}". Debes completar el pago antes de solicitar uno nuevo.`,
        },
        { status: 409 },
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

    const { monto: montoCop, uso, descripcion, plazo_dias, numero_cuotas, referadora_id } = validation.data;

    // ------------------------------------------------------------------
    // 3b. Validar la referadora elegida (modelo GACC)
    //     Debe ser un miembro validado del MISMO GACC y distinta del solicitante.
    // ------------------------------------------------------------------
    if (referadora_id === typedParticipante.id) {
      return NextResponse.json(
        { error: 'REFERADORA_INVALIDA', detail: 'No puedes elegirte a ti misma como referadora' },
        { status: 400 },
      );
    }

    const { data: rawReferadora } = await supabase
      .from('participantes')
      .select('id, nombre, gacc_id, validado_gacc')
      .eq('id', referadora_id)
      .maybeSingle();

    const referadora = rawReferadora as
      | { id: string; nombre: string; gacc_id: string | null; validado_gacc: boolean }
      | null;

    if (!referadora) {
      return NextResponse.json(
        { error: 'REFERADORA_NO_ENCONTRADA', detail: 'La referadora seleccionada no existe' },
        { status: 404 },
      );
    }

    if (referadora.gacc_id !== typedParticipante.gacc_id) {
      return NextResponse.json(
        { error: 'REFERADORA_OTRO_GACC', detail: 'La referadora debe pertenecer a tu mismo GACC' },
        { status: 403 },
      );
    }

    if (!referadora.validado_gacc) {
      return NextResponse.json(
        { error: 'REFERADORA_NO_VALIDADA', detail: 'La referadora aún no ha sido validada en el GACC' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Save COPm amount directly (COPm = COP 1:1).
    //    monto stores the human-readable COPm value (e.g., "1000000" for 1M COPm).
    //    Wei conversion only happens at the blockchain boundary:
    //    disbursement and payment verification.
    // ------------------------------------------------------------------
    const interesPorcentaje = INTERES_PORCENTAJE;

    const expiracionEn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: nuevoCredito, error: insertError } = await supabase
      .from('creditos')
      .insert({
        prestatario_id: typedParticipante.id,
        referadora_id: referadora_id,
        monto: montoCop.toString(),
        uso: uso,
        descripcion: descripcion ?? null,
        estado: 'pendiente' as never,
        interes_porcentaje: interesPorcentaje,
        plazo_dias: plazo_dias,
        numero_cuotas: numero_cuotas,
        expiracion_en: expiracionEn,
      } as never)
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
        monto: montoCop,
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

export async function GET(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

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
    let typedParticipante = bearerResult?.participante ?? null;
    if (!typedParticipante) {
      const { data: participante } = await supabase
        .from('participantes')
        .select(PARTICIPANTE_AUTH_SELECT)
        .eq('user_id', user.id)
        .single();

      typedParticipante = participante;
    }

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
