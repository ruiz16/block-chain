'use client';

// =============================================================================
// MisCreditosClient — Read-only table of all user credits
// =============================================================================
//
// Fetches all credits for the authenticated borrower via GET /api/mis-creditos
// and displays them in a sortable table with status badges.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import CeloScanLink from '@/components/shared/CeloScanLink';
import { StatusBadge, LoadingSkeleton, ErrorAlert, EmptyState } from '@/components/ui';
import type { CreditoRow } from '@/types/database';

type PageState = 'loading' | 'empty' | 'list' | 'error';

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
    return <LoadingSkeleton variant="table" />;
  }

  // ==========================================================================
  // Render: empty state
  // ==========================================================================
  if (state === 'empty') {
    return (
      <EmptyState
        title="No tienes créditos registrados"
        description="Aún no has solicitado ningún crédito en la plataforma."
        icon={
          <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        }
      />
    );
  }

  // ==========================================================================
  // Render: error state
  // ==========================================================================
  if (state === 'error') {
    return <ErrorAlert message={errorMsg!} onRetry={fetchCreditos} />;
  }

  // ==========================================================================
  // Render: list state
  // ==========================================================================
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
      <div className="overflow-x-auto">
        <table
          className="min-w-full divide-y divide-slate-100 dark:divide-gray-700"
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
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {creditos.map((credito) => {
              const montoCop = Number(credito.monto);

              return (
                <tr key={credito.id} className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">
                    $ {montoCop.toLocaleString('es-CO')} COPm
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <StatusBadge status={credito.estado} />
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-medium">
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
                      <span className="text-slate-400 dark:text-gray-500 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    {credito.tx_hash_pago ? (
                      <CeloScanLink txHash={credito.tx_hash_pago} />
                    ) : (
                      <span className="text-slate-400 dark:text-gray-500 font-medium">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-medium">
                    {credito.fecha_pago
                      ? new Date(credito.fecha_pago).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : <span className="text-slate-400 dark:text-gray-500 font-medium">—</span>}
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
