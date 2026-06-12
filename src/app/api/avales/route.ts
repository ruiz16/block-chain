// =============================================================================
// GET  /api/avales         — Listar avales (filtro por credito / participante)
// POST /api/avales         — Asignar aval a un crédito
// =============================================================================
//
// Follows the same pattern as /api/desembolso:
// - Zod validation at the boundary (400 on failure)
// - Business logic checks with descriptive error codes
// - Supabase service-role client for all DB operations
// - Audit log via registrarAuditLog
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { requireRoles } from '@/lib/auth-guards';
import {
  AsignarAvalSchema,
  AvalQuerySchema,
} from '@/lib/validations/avales';
import { registrarAuditLog } from '@/lib/audit/logger';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface CreditoRowSimple {
  id: string;
  monto: string;
  estado: string;
  prestatario_id: string;
}

interface ParticipanteRowSimple {
  id: string;
  nombre: string;
  wallet_address: string;
  rol: string;
  gacc_id: string | null;
  validado_gacc: boolean;
}

interface AvalJoinRow {
  id: string;
  aval_id: string;
  prestatario_id: string;
  credito_id: string;
  monto_maximo: string;
  fecha_creacion: string;
  activo: boolean;
  participantes: ParticipanteRowSimple | ParticipanteRowSimple[];
}

interface GaccMiembroRow {
  participante_id: string;
}

interface AvalCountRow {
  aval_id: string;
}

// =============================================================================
// POST /api/avales — Avalar un crédito desde el GACC
// =============================================================================
//
// Nuevo modelo (Junio 2026):
// - El rol 'aval' ya no existe. Cualquier miembro activo de un GACC puede
//   avalar los créditos de sus compañeros de grupo.
// - El crédito SOLO pasa a 'avalado' cuando TODOS los miembros del GACC
//   (excepto el prestatario) han avalado.
// - El avalador_id se obtiene de la sesión autenticada (no se acepta en el body).
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para avalar un crédito' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Look up current user's participante row
    // ------------------------------------------------------------------
    const { data: rawAvalador } = await supabase
      .from('participantes')
      .select('id, nombre, wallet_address, rol, gacc_id, validado_gacc')
      .eq('user_id', user.id)
      .single();

    const typedAvalador = rawAvalador as unknown as ParticipanteRowSimple | null;

    if (!typedAvalador) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

    const avalador_id = typedAvalador.id;

    // ------------------------------------------------------------------
    // 3. Parse and validate body (only credito_id)
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CUERPO_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = AsignarAvalSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'DATOS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Datos de entrada inválidos',
        },
        { status: 400 },
      );
    }

    const { credito_id } = validation.data;

    // ------------------------------------------------------------------
    // 4. Fetch credit — must exist, be in 'pendiente', and not expired
    // ------------------------------------------------------------------
    const { data: credito, error: creditoError } = await supabase
      .from('creditos')
      .select('id, monto, estado, prestatario_id, expiracion_en, plazo_dias')
      .eq('id', credito_id)
      .single();

    if (creditoError || !credito) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    const typedCredito = credito as unknown as {
      id: string;
      monto: string;
      estado: string;
      prestatario_id: string;
      expiracion_en: string | null;
      plazo_dias: number;
    };

    if (typedCredito.estado !== 'pendiente') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${typedCredito.estado}", debe estar en "pendiente"`,
        },
        { status: 409 },
      );
    }

    // Lazy expiration: if past expiracion_en, mark as expirado and reject
    if (typedCredito.expiracion_en && new Date(typedCredito.expiracion_en) < new Date()) {
      await supabase
        .from('creditos')
        .update({ estado: 'expirado' } as never)
        .eq('id', typedCredito.id);

      return NextResponse.json(
        {
          error: 'CREDITO_EXPIRADO',
          detail: 'Este crédito expiró porque no consiguió los avales necesarios a tiempo.',
        },
        { status: 410 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check self-assignment (no te puedes avalar a ti mismo)
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    if (avalador_id === typedCredito.prestatario_id) {
      return NextResponse.json(
        { error: 'AUTOVAL_INVALIDO', detail: 'No puedes avalar tu propio crédito' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Verify GACC membership
    //    Both the prestatario and the avalador must belong to the same
    //    active GACC, and both must be validated GACC members.
    // ------------------------------------------------------------------

    // 6a. Get prestatario's participante (with gacc_id)
    const { data: rawPrestatario } = await supabase
      .from('participantes')
      .select('id, gacc_id, validado_gacc')
      .eq('id', typedCredito.prestatario_id)
      .single();

    const prestatario = rawPrestatario as unknown as ParticipanteRowSimple | null;

    if (!prestatario || !prestatario.gacc_id) {
      return NextResponse.json(
        { error: 'SIN_GACC', detail: 'El prestatario no pertenece a un GACC' },
        { status: 403 },
      );
    }

    if (!prestatario.validado_gacc) {
      return NextResponse.json(
        { error: 'GACC_NO_VALIDADO', detail: 'El prestatario no ha sido validado en el GACC' },
        { status: 403 },
      );
    }

    if (typedAvalador.gacc_id !== prestatario.gacc_id) {
      return NextResponse.json(
        { error: 'GACC_DIFERENTE', detail: 'No perteneces al mismo GACC que el prestatario' },
        { status: 403 },
      );
    }

    if (!typedAvalador.validado_gacc) {
      return NextResponse.json(
        { error: 'AVALADOR_NO_VALIDADO', detail: 'Debes ser validado en el GACC para poder avalar créditos' },
        { status: 403 },
      );
    }

    const grupoId = prestatario.gacc_id;

    // ------------------------------------------------------------------
    // 7. Check no duplicate active aval (same avalador + same credit)
    // ------------------------------------------------------------------
    const { data: existingAval, error: existingError } = await supabase
      .from('avales')
      .select('id')
      .eq('aval_id', avalador_id)
      .eq('credito_id', credito_id)
      .eq('activo', true)
      .maybeSingle();

    if (existingError) {
      console.warn('[avales] Error al verificar aval duplicado:', existingError.message);
    }

    if (existingAval) {
      return NextResponse.json(
        { error: 'AVAL_DUPLICADO', detail: 'Ya has avalado este crédito' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 8. Get credit monto to use as default monto_maximo
    // ------------------------------------------------------------------
    const montoMaximo = typedCredito.monto;

    // ------------------------------------------------------------------
    // 9. INSERT aval row
    // ------------------------------------------------------------------
    const { data: newAval, error: insertError } = await supabase
      .from('avales')
      .insert({
        aval_id: avalador_id,
        prestatario_id: typedCredito.prestatario_id,
        credito_id: typedCredito.id,
        monto_maximo: montoMaximo,
        activo: true,
      })
      .select()
      .single();

    if (insertError || !newAval) {
      console.error('[avales] Error al insertar aval:', insertError?.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al registrar el aval en la base de datos' },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 10. Check if 3 avales reached → auto-approve
    // ------------------------------------------------------------------

    // 10a. Count only avales from GACC members (excluding prestatario)
    const { data: miembros } = await supabase
      .from('gacc_miembros')
      .select('participante_id')
      .eq('grupo_id', grupoId)
      .eq('activo', true)
      .not('participante_id', 'eq', typedCredito.prestatario_id);

    const avaladorIds = (miembros ?? []).map((m: GaccMiembroRow) => m.participante_id);

    const AVALES_MINIMOS = 3;
    let avalCount = 0;

    if (avaladorIds.length > 0) {
      const { count } = await supabase
        .from('avales')
        .select('id', { count: 'exact', head: true })
        .eq('credito_id', credito_id)
        .eq('activo', true)
        .in('aval_id', avaladorIds);

      avalCount = count ?? 0;
    }

    const umbralAlcanzado = avalCount >= AVALES_MINIMOS;
    let nuevoEstado = 'pendiente';

    if (umbralAlcanzado) {
      nuevoEstado = 'aprobado';

      const fechaVencimiento = new Date(
        Date.now() + typedCredito.plazo_dias * 24 * 60 * 60 * 1000,
      ).toISOString();

      await supabase
        .from('creditos')
        .update({
          estado: 'aprobado',
          fecha_vencimiento: fechaVencimiento,
        } as never)
        .eq('id', typedCredito.id);
    }

    // ------------------------------------------------------------------
    // 11. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'aval_agregado',
      entidadTipo: 'credito',
      entidadId: typedCredito.id,
      participanteId: avalador_id,
      detalles: {
        aval_id: avalador_id,
        avalador_nombre: typedAvalador.nombre,
        credito_id: typedCredito.id,
        monto_maximo: montoMaximo,
        avales_actuales: avalCount,
        avales_minimos: AVALES_MINIMOS,
        umbral_alcanzado: umbralAlcanzado,
        auto_aprobado: umbralAlcanzado,
      },
    });

    // ------------------------------------------------------------------
    // 12. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'aval_asignado' as const,
        aval: newAval,
        credito_estado: nuevoEstado,
        avales_minimos: AVALES_MINIMOS,
        avales_actuales: avalCount,
        umbral_alcanzado: umbralAlcanzado,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[avales] Error inesperado en POST:', err);

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
// GET /api/avales — Listar Avales
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 0. Security guard: Must be authenticated
    // ------------------------------------------------------------------
    const auth = await requireRoles(request, ['admin', 'usuario']);
    if (auth instanceof Response) return auth;

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const validation = AvalQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'PARAMETROS_INVALIDOS',
          detail: validation.error.issues[0]?.message ?? 'Parámetros de consulta inválidos',
        },
        { status: 400 },
      );
    }

    const { credito_id, participante_id } = validation.data;
    const supabase = getSupabaseClient();

    // Build the query with a join to participantes to get avalador info
    let query = supabase
      .from('avales')
      .select(`
        id,
        aval_id,
        prestatario_id,
        credito_id,
        monto_maximo,
        fecha_creacion,
        activo,
        participantes!avales_aval_id_fkey (
          nombre,
          wallet_address
        )
      `);

    if (credito_id) {
      query = query.eq('credito_id', credito_id);
    }

    if (participante_id) {
      query = query.eq('aval_id', participante_id);
    }

    const { data, error } = await query.order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('[avales] Error al listar avales:', error.message);

      return NextResponse.json(
        { error: 'ERROR_INTERNO', detail: 'Error al consultar los avales' },
        { status: 500 },
      );
    }

    // Map to response format with avalador info
    const rawRows = (data ?? []) as AvalJoinRow[];

    const avales = rawRows.map((row) => {
      const rawParticipante = row.participantes;
      const avalador = Array.isArray(rawParticipante) ? rawParticipante[0] : rawParticipante;

      return {
        id: row.id,
        aval_id: row.aval_id,
        prestatario_id: row.prestatario_id,
        credito_id: row.credito_id,
        monto_maximo: row.monto_maximo,
        fecha_creacion: row.fecha_creacion,
        activo: row.activo,
        avalador_nombre: avalador?.nombre ?? 'Desconocido',
        avalador_wallet: avalador?.wallet_address ?? '',
      };
    });

    return NextResponse.json(avales, { status: 200 });
  } catch (err) {
    console.error('[avales] Error inesperado en GET:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
