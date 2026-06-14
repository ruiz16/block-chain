'use client';

// =============================================================================
// SemaforoGacc — Tarjeta de Score grupal + Semáforo de mora del GACC
// =============================================================================
//
// Consume GET /api/gacc/semaforo y muestra:
//   - score_gacc (puntaje colectivo del grupo)
//   - semáforo de mora: verde / amarillo / rojo (indicador visual)
//   - estado operativo: activo / restringido / inactivo (StatusBadge).
//     Si estado === 'restringido' se resalta con énfasis (warning/error).
//
// States:
//   loading  — spinner discreto
//   hidden   — el usuario no pertenece a un GACC (SIN_GACC / 404) → no renderiza
//   error    — banner de error con reintento
//   ready    — tarjeta con score + semáforo
//
// Reutiliza la estética de HealthIndicator (punto de color + etiqueta) y
// StatusBadge para el estado operativo.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { StatusBadge } from '@/components/ui';

type ComponentState = 'loading' | 'hidden' | 'error' | 'ready';

type SemaforoColor = 'verde' | 'amarillo' | 'rojo';
type GaccEstado = 'activo' | 'restringido' | 'inactivo';

interface SemaforoResponse {
  grupo_id: string;
  nombre: string;
  score_gacc: number;
  estado: GaccEstado;
  semaforo: SemaforoColor;
  max_dias_mora: number;
  cuotas_vencidas: number;
  creditos_en_mora: number;
  es_lider: boolean;
}

// ---------------------------------------------------------------------------
// Mapa visual del semáforo de mora (mismo lenguaje que HealthIndicator)
// ---------------------------------------------------------------------------

const SEMAFORO_STYLES: Record<SemaforoColor, { dot: string; text: string; label: string; pulse: boolean }> = {
  verde: {
    dot: 'bg-emerald-500 dark:bg-emerald-400 shadow-sm shadow-emerald-300/50',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'Al día',
    pulse: false,
  },
  amarillo: {
    dot: 'bg-amber-500 dark:bg-amber-400 shadow-sm shadow-amber-300/50',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'En mora leve',
    pulse: false,
  },
  rojo: {
    dot: 'bg-red-500 dark:bg-red-400 shadow-sm shadow-red-300/50',
    text: 'text-red-600 dark:text-red-400',
    label: 'En mora grave',
    pulse: true,
  },
};

const ESTADO_LABELS: Record<GaccEstado, string> = {
  activo: 'Activo',
  restringido: 'Restringido',
  inactivo: 'Inactivo',
};

function SemaforoMora({ color }: { color: SemaforoColor }) {
  const s = SEMAFORO_STYLES[color];
  return (
    <span className={`inline-flex items-center gap-1.5 ${s.text}`} title={`Semáforo: ${s.label}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
      <span className="text-xs font-semibold">{s.label}</span>
    </span>
  );
}

export default function SemaforoGacc() {
  const [state, setState] = useState<ComponentState>('loading');
  const [data, setData] = useState<SemaforoResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSemaforo = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/gacc/semaforo');

      // 404 SIN_GACC / GACC_NO_ENCONTRADO → el usuario no tiene grupo: ocultar.
      if (res.status === 404) {
        setState('hidden');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? 'No se pudo cargar el semáforo del GACC');
      }

      const json = (await res.json()) as SemaforoResponse;
      setData(json);
      setState('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setState('error');
    }
  }, []);

  useEffect(() => {
    fetchSemaforo();
  }, [fetchSemaforo]);

  // ==========================================================================
  // Render: hidden (sin GACC) → nada
  // ==========================================================================
  if (state === 'hidden') {
    return null;
  }

  // ==========================================================================
  // Render: loading
  // ==========================================================================
  if (state === 'loading') {
    return (
      <div
        className="mb-6 flex items-center justify-center rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 p-6 shadow-sm"
        aria-busy="true"
        role="status"
      >
        <svg className="animate-spin h-5 w-5 text-blue-600 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-gray-500 dark:text-gray-400 text-sm">Cargando estado del grupo…</span>
      </div>
    );
  }

  // ==========================================================================
  // Render: error
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="mb-6 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4" role="alert">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-200">{errorMsg ?? 'Error al cargar el semáforo'}</p>
          <button
            onClick={fetchSemaforo}
            className="inline-flex items-center px-3 py-1.5 border border-red-300 dark:border-red-700 text-xs font-medium rounded-md text-red-700 dark:text-red-300 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shrink-0"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: ready
  // ==========================================================================
  if (!data) return null;

  const restringido = data.estado === 'restringido';

  return (
    <div
      className={`mb-6 rounded-2xl border bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20 overflow-hidden ${
        restringido
          ? 'border-red-300 dark:border-red-800'
          : 'border-slate-200/80 dark:border-slate-700'
      }`}
    >
      {/* Header */}
      <div className="px-6 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between gap-4">
        <h3 className="text-sm font-bold text-white truncate">Estado del grupo</h3>
        <StatusBadge
          status={restringido ? 'default' : data.estado === 'activo' ? 'activo' : 'inactivo'}
          label={ESTADO_LABELS[data.estado]}
        />
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Score grupal */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-slate-200/80 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Score del GACC</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {data.score_gacc}
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500">/100</span>
            </p>
          </div>

          {/* Semáforo de mora */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-slate-200/80 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Semáforo de mora</p>
            <div className="mt-2">
              <SemaforoMora color={data.semaforo} />
            </div>
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Mora máxima: {data.max_dias_mora} día{data.max_dias_mora === 1 ? '' : 's'}
            </p>
          </div>

          {/* Créditos en mora */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-slate-200/80 dark:border-slate-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Créditos en mora</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {data.creditos_en_mora}
            </p>
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              {data.cuotas_vencidas} cuota{data.cuotas_vencidas === 1 ? '' : 's'} vencida{data.cuotas_vencidas === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Énfasis cuando el grupo está restringido (penalización colectiva) */}
        {restringido && (
          <div className="mt-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3" role="alert">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">Grupo restringido</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                  El GACC está restringido por bajo puntaje colectivo. No puede solicitar nuevos créditos hasta recuperar el score grupal.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Aviso preventivo en amarillo (sin restricción todavía) */}
        {!restringido && data.semaforo === 'amarillo' && (
          <div className="mt-4 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3" role="alert">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Hay cuotas con atraso en el grupo. Pónganse al día para evitar la restricción colectiva.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
