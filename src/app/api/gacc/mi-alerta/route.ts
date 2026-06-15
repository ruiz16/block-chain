// =============================================================================
// GET /api/gacc/mi-alerta — Alerta de mora PERSONALIZADA por relación
// =============================================================================
//
// A diferencia del semáforo grupal (salud agregada, visible para todos), este
// endpoint NO expone datos financieros a miembros no involucrados. Devuelve si
// al usuario autenticado le concierne una cuota en mora de su GACC y, solo en
// ese caso, el nombre del deudor:
//
//   - 'propio'     → el moroso es el propio usuario (sin nombre, es él mismo)
//   - 'referadora' → el usuario es la referidora del crédito moroso (con nombre)
//   - 'lider'      → el usuario es el Líder Social del GACC: ve CUALQUIER mora
//                    del grupo, con nombre (rol de gobernanza)
//   - resto        → alerta: false (no ve nada)
//
// Prioridad cuando aplican varias: propio > referadora > lider.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';

type RolAlerta = 'propio' | 'referadora' | 'lider';

interface MiAlertaResponse {
  alerta: boolean;
  rol: RolAlerta | null;
  deudor_nombre: string | null;
  dias_mora: number;
  total_moras: number;
}

const SIN_ALERTA: MiAlertaResponse = {
  alerta: false,
  rol: null,
  deudor_nombre: null,
  dias_mora: 0,
  total_moras: 0,
};

function diasDesde(fechaIso: string): number {
  return Math.floor((Date.now() - new Date(fechaIso).getTime()) / (24 * 60 * 60 * 1000));
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Auth
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
        { status: 401 },
      );
    }

    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 2. Participante (id + gacc_id)
    // ------------------------------------------------------------------
    let myId = bearerResult?.participante?.id ?? null;
    let gaccId = bearerResult?.participante?.gacc_id ?? null;

    if (!myId) {
      const { data } = await supabase
        .from('participantes')
        .select('id, gacc_id')
        .eq('user_id', user.id)
        .single();
      myId = data?.id ?? null;
      gaccId = data?.gacc_id ?? null;
    }

    // Sin participante o sin GACC → no hay alerta que mostrar.
    if (!myId || !gaccId) {
      return NextResponse.json(SIN_ALERTA, { status: 200 });
    }

    // ------------------------------------------------------------------
    // 3. ¿Soy el Líder Social del grupo?
    // ------------------------------------------------------------------
    const { data: grupo } = await supabase
      .from('grupos_gacc')
      .select('lider_id')
      .eq('id', gaccId)
      .single();

    const esLider = !!grupo && (grupo as { lider_id: string | null }).lider_id === myId;

    // ------------------------------------------------------------------
    // 4. Créditos desembolsados del grupo
    // ------------------------------------------------------------------
    const { data: rawMiembros } = await supabase
      .from('participantes')
      .select('id')
      .eq('gacc_id', gaccId)
      .eq('activo', true);
    const miembroIds = (rawMiembros ?? []).map((m: { id: string }) => m.id);

    if (miembroIds.length === 0) return NextResponse.json(SIN_ALERTA, { status: 200 });

    const { data: rawCreditos } = await supabase
      .from('creditos')
      .select('id, prestatario_id, referadora_id')
      .in('prestatario_id', miembroIds)
      .eq('estado', 'desembolsado');
    const creditos = (rawCreditos ?? []) as {
      id: string;
      prestatario_id: string;
      referadora_id: string | null;
    }[];

    if (creditos.length === 0) return NextResponse.json(SIN_ALERTA, { status: 200 });

    // ------------------------------------------------------------------
    // 5. Cuotas en mora (vencidas no pagadas) → mora máxima por crédito
    // ------------------------------------------------------------------
    const creditoIds = creditos.map((c) => c.id);
    const nowIso = new Date().toISOString();

    const { data: rawCuotas } = await supabase
      .from('cuotas')
      .select('credito_id, fecha_vencimiento')
      .in('credito_id', creditoIds)
      .neq('estado', 'pagada')
      .lt('fecha_vencimiento', nowIso);
    const cuotas = (rawCuotas ?? []) as { credito_id: string; fecha_vencimiento: string }[];

    if (cuotas.length === 0) return NextResponse.json(SIN_ALERTA, { status: 200 });

    const moraPorCredito = new Map<string, number>();
    for (const cuota of cuotas) {
      const dias = diasDesde(cuota.fecha_vencimiento);
      moraPorCredito.set(cuota.credito_id, Math.max(moraPorCredito.get(cuota.credito_id) ?? 0, dias));
    }

    // ------------------------------------------------------------------
    // 6. Créditos morosos que ME conciernen
    // ------------------------------------------------------------------
    const morosos = creditos.filter((c) => moraPorCredito.has(c.id));
    const relevantes = morosos.filter(
      (c) => c.prestatario_id === myId || c.referadora_id === myId || esLider,
    );

    if (relevantes.length === 0) return NextResponse.json(SIN_ALERTA, { status: 200 });

    // ------------------------------------------------------------------
    // 7. Elegir el crédito a destacar (prioridad: propio > referadora > líder)
    // ------------------------------------------------------------------
    const propio = relevantes.find((c) => c.prestatario_id === myId);
    const comoReferadora = relevantes.find((c) => c.referadora_id === myId);

    let rol: RolAlerta;
    let credito: { id: string; prestatario_id: string };

    if (propio) {
      rol = 'propio';
      credito = propio;
    } else if (comoReferadora) {
      rol = 'referadora';
      credito = comoReferadora;
    } else {
      rol = 'lider';
      // El de mayor mora, para destacar el caso más urgente.
      credito = relevantes.reduce((a, b) =>
        (moraPorCredito.get(b.id) ?? 0) > (moraPorCredito.get(a.id) ?? 0) ? b : a,
      );
    }

    // ------------------------------------------------------------------
    // 8. Nombre del deudor (solo referadora/líder; nunca para 'propio')
    // ------------------------------------------------------------------
    let deudorNombre: string | null = null;
    if (rol !== 'propio') {
      const { data: deudor } = await supabase
        .from('participantes')
        .select('nombre')
        .eq('id', credito.prestatario_id)
        .single();
      deudorNombre = (deudor as { nombre: string } | null)?.nombre ?? null;
    }

    const response: MiAlertaResponse = {
      alerta: true,
      rol,
      deudor_nombre: deudorNombre,
      dias_mora: moraPorCredito.get(credito.id) ?? 0,
      total_moras: relevantes.length,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[gacc/mi-alerta] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
