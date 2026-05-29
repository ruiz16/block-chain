// =============================================================================
// Aprobación Page — Panel de Aprobación de Créditos
// =============================================================================
//
// Server component: fetches pending credits from Supabase on the server
// along with their aval counts, and passes them to the client-side
// PanelAprobacion with integrated GestorAvales for each credit row.
//
// Route: /aprobacion
// =============================================================================

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import PanelAprobacion from '@/components/creditos/PanelAprobacion';
import GestorAvales from '@/components/avales/GestorAvales';
import type { CreditoPendiente } from '@/types/database';

export const metadata = {
  title: 'Panel de Aprobación — BlockChain',
  description: 'Revisa y aprueba créditos pendientes en la plataforma',
};

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface CreditoRowWithPrestatario {
  id: string;
  monto: string;
  estado: string;
  fecha_solicitud: string;
  prestatario_id: string;
  participantes: {
    nombre: string;
    score_reputacion: number;
  } | { nombre: string; score_reputacion: number }[];
}

export default async function AprobacionPage() {
  const cookieStore = await cookies();
  
  const user = await getServerUser(cookieStore);

  // Security guard: Must be authenticated and NOT a 'prestatario'
  if (!user) {
    redirect('/login?redirect=/aprobacion');
  }

  const supabase = getSupabaseClient();

  const { data } = await supabase
    .from('participantes')
    .select('rol')
    .eq('user_id', user.id)
    .single();

  const participante = data as { rol: string } | null;

  if (!participante || participante.rol === 'prestatario') {
    // Borrowers shouldn't even see the dashboard side of approval
    redirect('/login?error=UNAUTHORIZED_ROLE');
  }

  let creditos: CreditoPendiente[] = [];
  let fetchError: string | null = null;

  try {

    // Fetch credits in pending or approved states (two-step flow)
    const { data, error } = await supabase
      .from('creditos')
      .select(`
        id,
        monto,
        estado,
        fecha_solicitud,
        prestatario_id,
        participantes!creditos_prestatario_id_fkey (
          nombre,
          score_reputacion
        )
      `)
      .in('estado', ['pendiente', 'avalado', 'aprobado'])
      .order('fecha_solicitud', { ascending: false });

    if (error) {
      fetchError = error.message;
    } else if (data) {
      const rawRows = data as unknown as CreditoRowWithPrestatario[];

      // Fetch aval count per credit in a single batch
      const creditIds = rawRows.map((r) => r.id);
      const { data: avalCounts } = await supabase
        .from('avales')
        .select('credito_id, id')
        .in('credito_id', creditIds)
        .eq('activo', true);

      // Build a map of credito_id → active count
      const avalCountMap: Record<string, number> = {};
      if (avalCounts) {
        for (const row of avalCounts) {
          const cid = (row as { credito_id: string; id: string }).credito_id;
          avalCountMap[cid] = (avalCountMap[cid] ?? 0) + 1;
        }
      }

      creditos = rawRows.map((row) => {
        const rawPrestatario = row.participantes;
        const prestatario = Array.isArray(rawPrestatario) ? rawPrestatario[0] : rawPrestatario;

        return {
          id: row.id,
          monto: Number(row.monto),
          solicitante: prestatario?.nombre ?? 'Desconocido',
          score: prestatario?.score_reputacion ?? 0,
          fecha: row.fecha_solicitud,
          estado: row.estado as CreditoPendiente['estado'],
          prestatarioId: row.prestatario_id,
          avalCount: avalCountMap[row.id] ?? 0,
        };
      });
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Error al conectar con la base de datos';
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Panel de Aprobación</h1>
        <p className="mt-1 text-sm text-gray-500">
          Revisa y aprueba créditos pendientes para desembolsar fondos
        </p>
      </div>

      {fetchError ? (
        <div className="rounded-md bg-red-50 border border-red-200 p-4" role="alert">
          <p className="text-red-800 font-medium">Error al cargar créditos</p>
          <p className="text-red-600 text-sm mt-1">{fetchError}</p>
        </div>
      ) : (
        <PanelAprobacion
          creditosIniciales={creditos}
          renderAvalManager={(creditoId, prestatarioId, onEstadoChange) => (
            <GestorAvales
              creditoId={creditoId}
              prestatarioId={prestatarioId}
              onEstadoChange={onEstadoChange}
            />
          )}
        />
      )}
    </div>
  );
}
