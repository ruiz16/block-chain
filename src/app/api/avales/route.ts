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
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireReviewer, requireRoles } from '@/lib/auth-guards';
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

// =============================================================================
// POST /api/avales — Asignar Aval
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 0. Security guard: Must be admin, aval, or prestamista
    // ------------------------------------------------------------------
    const auth = await requireReviewer(request);
    if (auth instanceof Response) return auth;

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

    const { credito_id, avalador_id } = validation.data;
    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Fetch credit — must exist and be in 'pendiente'
    // ------------------------------------------------------------------
    const { data: credito, error: creditoError } = await supabase
      .from('creditos')
      .select('id, monto, estado, prestatario_id')
      .eq('id', credito_id)
      .single();

    if (creditoError || !credito) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    const typedCredito = credito as unknown as CreditoRowSimple;

    if (typedCredito.estado !== 'pendiente') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${typedCredito.estado}", debe estar en "pendiente"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Fetch avalador — must exist with rol = 'aval' or 'prestamista'
    // ------------------------------------------------------------------
    const { data: avalador, error: avaladorError } = await supabase
      .from('participantes')
      .select('id, nombre, wallet_address, rol')
      .eq('id', avalador_id)
      .single();

    if (avaladorError || !avalador) {
      return NextResponse.json(
        { error: 'AVALADOR_NO_ENCONTRADO', detail: 'No se encontró el participante especificado' },
        { status: 404 },
      );
    }

    const typedAvalador = avalador as unknown as ParticipanteRowSimple;

    if (typedAvalador.rol !== 'aval') {
      return NextResponse.json(
        {
          error: 'AVALADOR_INVALIDO',
          detail: `El participante tiene rol "${typedAvalador.rol}", debe ser "aval"`,
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Check self-assignment
    // ------------------------------------------------------------------
    if (avalador_id === typedCredito.prestatario_id) {
      return NextResponse.json(
        { error: 'AVALADOR_INVALIDO', detail: 'El avalador no puede ser el mismo prestatario del crédito' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check no duplicate active aval (same avalador + same credit)
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
        { error: 'AVAL_DUPLICADO', detail: 'Este avalador ya tiene un aval activo para este crédito' },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Get credit monto to use as default monto_maximo
    // ------------------------------------------------------------------
    const montoMaximo = typedCredito.monto;

    // ------------------------------------------------------------------
    // 7. INSERT aval row
    // ------------------------------------------------------------------
    const { data: newAval, error: insertError } = await supabase
      .from('avales')
      .insert({
        aval_id: avalador_id,
        prestatario_id: typedCredito.prestatario_id,
        credito_id: typedCredito.id,
        monto_maximo: montoMaximo,
        activo: true,
      } as never)
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
    // 8. UPDATE credit state to 'avalado'
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('creditos')
      .update({ estado: 'avalado' } as never)
      .eq('id', typedCredito.id);

    if (updateError) {
      console.warn(
        '[avales] Error al actualizar estado del crédito después de insertar aval:',
        updateError.message,
        { credito_id: typedCredito.id },
      );
    }

    // ------------------------------------------------------------------
    // 9. Audit log
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
      },
    });

    // ------------------------------------------------------------------
    // 10. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'aval_asignado' as const,
        aval: newAval,
        credito_estado: 'avalado',
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
    // 0. Security guard: Must be authenticated (any role for GET for now)
    // ------------------------------------------------------------------
    const auth = await requireRoles(request, ['admin', 'aval', 'prestatario']);
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
    const rawRows = (data ?? []) as unknown as AvalJoinRow[];

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
