'use client';

// =============================================================================
// MisCreditosClient — Read-only table of all user credits
// =============================================================================
//
// Fetches all credits for the authenticated borrower via GET /api/mis-creditos
// and displays them in a sortable table with status badges.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { cusdToCop, getCeloScanUrl } from '@/config/celo';
import CeloScanLink from '@/components/shared/CeloScanLink';
import type { CreditoRow, EstadoCredito } from '@/types/database';

type PageState = 'loading' | 'empty' | 'list' | 'error';

// =============================================================================
// Estado badge colors
// =============================================================================

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-700 border border-amber-200/60',
  avalado: 'bg-purple-50 text-purple-700 border border-purple-200/60',
  aprobado: 'bg-sky-50 text-sky-700 border border-sky-200/60',
  desembolsado: 'bg-indigo-50 text-indigo-700 border border-indigo-200/60',
  pagado: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  default: 'bg-rose-50 text-rose-700 border border-rose-200/60',
};

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  avalado: 'Avalado',
  aprobado: 'Aprobado',
  desembolsado: 'Desembolsado',
  pagado: 'Pagado',
  default: 'Default',
};

// =============================================================================
// Component
// =============================================================================

export default function MisCreditosClient() {
  const [state, setState] = useState<PageState>('loading');
  const [creditos, setCreditos] = useState<CreditoRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch credits on mount
  // ------------------------------------------------------------------
  const fetchCreditos = useCallback(async () => {
    try {
      await Promise.resolve();
      setState('loading');
      const res = await fetch('/api/mis-creditos');

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const rows = (data.creditos ?? []) as CreditoRow[];

      setCreditos(rows);
      setState(rows.length === 0 ? 'empty' : 'list');
    } catch {
      setErrorMsg('Error al cargar tus créditos');
      setState('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCreditos();
  }, [fetchCreditos]);

  // ==========================================================================
  // Render: loading state
  // ==========================================================================
  if (state === 'loading') {
    return (
      <div
        className="flex items-center justify-center p-8"
        aria-busy="true"
        role="status"
      >
        <svg
          className="animate-spin h-8 w-8 text-blue-600 mr-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-gray-600">Cargando tus créditos…</span>
      </div>
    );
  }

  // ==========================================================================
  // Render: empty state
  // ==========================================================================
  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <svg
          className="h-16 w-16 text-gray-300 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <p className="text-gray-500 text-lg">No tienes créditos registrados</p>
      </div>
    );
  }

  // ==========================================================================
  // Render: error state
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4" role="alert">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-red-500 mt-0.5 mr-3 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <p className="text-red-800 font-medium">{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: list state
  // ==========================================================================
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-100/40">
      <div className="overflow-x-auto">
        <table
          className="min-w-full divide-y divide-slate-100"
          aria-label="Todos tus créditos"
        >
          <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
            <tr>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Monto
              </th>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Estado
              </th>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Fecha solicitud
              </th>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Tx Desembolso
              </th>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Tx Pago
              </th>
              <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Fecha pago
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {creditos.map((credito) => {
              const montoCusd = (() => {
                try {
                  return formatCusd(parseCusd(credito.monto));
                } catch {
                  return 0;
                }
              })();

              return (
                <tr key={credito.id} className="transition-colors duration-150 hover:bg-slate-50/70">
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-950 font-bold">
                    {montoCusd.toLocaleString('es-CO', { minimumFractionDigits: 2 })} cUSD
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        ESTADO_COLORS[credito.estado] ?? 'bg-slate-50 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {ESTADO_LABELS[credito.estado] ?? credito.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 font-medium">
                    {new Date(credito.fecha_solicitud).toLocaleDateString('es-CO', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    {credito.tx_hash ? (
                      <CeloScanLink txHash={credito.tx_hash} />
                    ) : (
                      <span className="text-slate-400 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    {credito.tx_hash_pago ? (
                      <CeloScanLink txHash={credito.tx_hash_pago} />
                    ) : (
                      <span className="text-slate-400 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 font-medium">
                    {credito.fecha_pago
                      ? new Date(credito.fecha_pago).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : <span className="text-slate-400 font-medium">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
