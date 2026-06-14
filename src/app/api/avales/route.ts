// =============================================================================
// GET  /api/avales         — Listar avales (filtro por credito / participante)
// POST /api/avales         — Otorgar un aval del circuito GACC (referadora|lider)
// =============================================================================
//
// Modelo GACC (Especificación de Arquitectura): cada crédito requiere DOS avales
// con roles fijos y secuenciales:
//   - Aval 1/2: la referadora elegida por el solicitante (creditos.referadora_id).
//     El crédito permanece en 'pendiente' y se notifica al Líder Social.
//   - Aval 2/2: el Líder Social del grupo (grupos_gacc.lider_id). Requiere que el
//     aval 1/2 ya exista. Al completarse, el crédito pasa a 'avalado'.
// Cualquier otro participante NO puede avalar. El rol se infiere de la sesión.
//
// Patrón: Zod en el borde, lógica de negocio con códigos de error en español,
// service-role client, audit log y notificaciones in-app.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';
import { requireRoles } from '@/lib/auth-guards';
import { AsignarAvalSchema, AvalQuerySchema } from '@/lib/validations/avales';
import { registrarAuditLog } from '@/lib/audit/logger';
import { decidirAval } from '@/lib/avales/circuito';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
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

// =============================================================================
// POST /api/avales — Otorgar un aval del circuito GACC
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

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para avalar un crédito' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Current user's participante row (the avalador)
    // ------------------------------------------------------------------
    const { data: rawAvalador } = await supabase
      .from('participantes')
      .select('id, nombre, wallet_address, rol, gacc_id, validado_gacc')
      .eq('user_id', user.id)
      .single();

    const avalador = rawAvalador as unknown as ParticipanteRowSimple | null;

    if (!avalador) {
      return NextResponse.json(
        { error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes un perfil de participante' },
        { status: 404 },
      );
    }

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
    const { data: rawCredito, error: creditoError } = await supabase
      .from('creditos')
      .select('id, monto, estado, prestatario_id, referadora_id, expiracion_en, plazo_dias')
      .eq('id', credito_id)
      .single();

    if (creditoError || !rawCredito) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    const credito = rawCredito as unknown as {
      id: string;
      monto: string;
      estado: string;
      prestatario_id: string;
      referadora_id: string | null;
      expiracion_en: string | null;
      plazo_dias: number;
    };

    if (credito.estado !== 'pendiente') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${credito.estado}", debe estar en "pendiente"`,
        },
        { status: 409 },
      );
    }

    // Lazy expiration: if past expiracion_en, mark as expirado and reject
    if (credito.expiracion_en && new Date(credito.expiracion_en) < new Date()) {
      await supabase
        .from('creditos')
        .update({ estado: 'expirado' } as never)
        .eq('id', credito.id);

      return NextResponse.json(
        {
          error: 'CREDITO_EXPIRADO',
          detail: 'Este crédito expiró porque no consiguió los avales necesarios a tiempo.',
        },
        { status: 410 },
      );
    }

    // ------------------------------------------------------------------
    // 5. No self-aval
    // ------------------------------------------------------------------
    if (avalador.id === credito.prestatario_id) {
      return NextResponse.json(
        { error: 'AUTOVAL_INVALIDO', detail: 'No puedes avalar tu propio crédito' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Fetch prestatario (gacc_id) and the group's Líder Social
    // ------------------------------------------------------------------
    const { data: rawPrestatario } = await supabase
      .from('participantes')
      .select('id, nombre, gacc_id, validado_gacc')
      .eq('id', credito.prestatario_id)
      .single();

    const prestatario = rawPrestatario as unknown as
      | { id: string; nombre: string; gacc_id: string | null; validado_gacc: boolean }
      | null;

    if (!prestatario || !prestatario.gacc_id) {
      return NextResponse.json(
        { error: 'SIN_GACC', detail: 'El prestatario no pertenece a un GACC' },
        { status: 403 },
      );
    }

    const { data: rawGrupo } = await supabase
      .from('grupos_gacc')
      .select('id, lider_id, estado')
      .eq('id', prestatario.gacc_id)
      .single();

    const grupo = rawGrupo as unknown as
      | { id: string; lider_id: string | null; estado: string }
      | null;

    if (!grupo) {
      return NextResponse.json(
        { error: 'GACC_NO_ENCONTRADO', detail: 'No se encontró el GACC del prestatario' },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 7. Defensive: avalador must be a validated member of the same GACC
    // ------------------------------------------------------------------
    if (avalador.gacc_id !== prestatario.gacc_id || !avalador.validado_gacc) {
      return NextResponse.json(
        { error: 'AVALADOR_NO_VALIDADO', detail: 'Debes ser miembro validado del GACC para avalar.' },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 8. Inspect existing active avales for this credit
    // ------------------------------------------------------------------
    const { data: rawAvales } = await supabase
      .from('avales')
      .select('id, aval_id, rol_aval')
      .eq('credito_id', credito.id)
      .eq('activo', true);

    const avalesActivos = (rawAvales ?? []) as unknown as {
      id: string;
      aval_id: string;
      rol_aval: string | null;
    }[];

    const tieneAvalReferadora = avalesActivos.some((a) => a.rol_aval === 'referadora');
    const tieneAvalLider = avalesActivos.some((a) => a.rol_aval === 'lider');
    const yaAvalo = avalesActivos.some((a) => a.aval_id === avalador.id);

    // ------------------------------------------------------------------
    // 9. Decide role + sequence (pure logic — see lib/avales/circuito.ts)
    // ------------------------------------------------------------------
    const decision = decidirAval({
      avaladorId: avalador.id,
      prestatarioId: credito.prestatario_id,
      referadoraId: credito.referadora_id,
      liderId: grupo.lider_id,
      tieneAvalReferadora,
      tieneAvalLider,
      yaAvalo,
    });

    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error, detail: decision.detail },
        { status: decision.status },
      );
    }

    const rolAval = decision.rolAval;

    // ------------------------------------------------------------------
    // 10. Insert aval row (with its role)
    // ------------------------------------------------------------------
    const { data: newAval, error: insertError } = await supabase
      .from('avales')
      .insert({
        aval_id: avalador.id,
        prestatario_id: credito.prestatario_id,
        credito_id: credito.id,
        monto_maximo: credito.monto,
        activo: true,
        rol_aval: rolAval,
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
    // 11. State transition (referadora 1/2 → 'pendiente'; lider 2/2 → 'avalado')
    // ------------------------------------------------------------------
    let creditoEstado = 'pendiente';

    if (rolAval === 'lider') {
      // El aval del Líder Social (2/2) completa el circuito → 'avalado'
      const fechaVencimiento = new Date(
        Date.now() + credito.plazo_dias * 24 * 60 * 60 * 1000,
      ).toISOString();

      await supabase
        .from('creditos')
        .update({ estado: 'avalado', fecha_vencimiento: fechaVencimiento } as never)
        .eq('id', credito.id);

      creditoEstado = 'avalado';
    }
    // Si rolAval === 'referadora' (1/2), el crédito permanece 'pendiente'.

    // ------------------------------------------------------------------
    // 12. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'aval_agregado',
      entidadTipo: 'credito',
      entidadId: credito.id,
      participanteId: avalador.id,
      detalles: {
        aval_id: avalador.id,
        avalador_nombre: avalador.nombre,
        rol_aval: rolAval,
        credito_id: credito.id,
        circuito_completo: rolAval === 'lider',
      },
    });

    // ------------------------------------------------------------------
    // 13. Return 201
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'aval_asignado' as const,
        aval: newAval,
        rol_aval: rolAval,
        credito_estado: creditoEstado,
        circuito: {
          referadora: rolAval === 'referadora' || tieneAvalReferadora,
          lider: rolAval === 'lider',
        },
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
        rol_aval,
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
    const rawRows = (data ?? []) as unknown as (AvalJoinRow & { rol_aval: string | null })[];

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
        rol_aval: row.rol_aval ?? null,
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
