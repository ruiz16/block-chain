'use client';

// =============================================================================
// Admin Desembolsos Page — Paginated Disbursement List
// =============================================================================
//
// Route: /admin/desembolsos
//
// Displays all disbursed credits (desembolsado, pagado, default) with amounts,
// transaction hashes, and blockchain explorer links.
// States: loading → skeleton | error → alert | empty → placeholder | loaded
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { DesembolsoAdmin } from '@/app/api/admin/desembolsos/route';
import CeloScanLink from '@/components/shared/CeloScanLink';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ESTADO_LABELS: Record<string, string> = {
  desembolsado: 'Desembolsado',
  pagado: 'Pagado',
  default: 'Default',
};

const ESTADO_COLORS: Record<string, string> = {
  desembolsado: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700',
  pagado: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700',
  default: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDesembolsosPage() {
  const [data, setData] = useState<DesembolsoAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/desembolsos?page=${page}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? 'Error al cargar desembolsos');
      }
      const json = await res.json() as { data: DesembolsoAdmin[]; total: number };
      setData(json.data);
      setTotal(json.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / limit);

  // ==========================================================================
  // Render: loading
  // ==========================================================================

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Desembolsos</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cargando desembolsos…</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20 overflow-hidden">
          <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
            <div className="h-3 bg-slate-700 rounded w-1/4" />
          </div>
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: error
  // ==========================================================================

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Desembolsos</h1>
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-red-800 dark:text-red-200 font-medium text-sm">Error al cargar desembolsos</p>
          <p className="text-red-600 dark:text-red-300 text-xs mt-1">{error}</p>
        </div>
        <button
          onClick={() => { setPage(1); fetchData(); }}
          className="mt-4 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ==========================================================================
  // Render: empty
  // ==========================================================================

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Desembolsos</h1>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-12 text-center shadow-lg shadow-slate-100/50 dark:shadow-black/20">
          <svg className="h-16 w-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h3 className="text-lg font-medium text-slate-800 dark:text-gray-200 mb-1">Sin desembolsos</h3>
          <p className="text-slate-400 dark:text-gray-500 text-sm">No hay desembolsos realizados aún.</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: loaded
  // ==========================================================================

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Desembolsos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {total} desembolso{total !== 1 ? 's' : ''} realizado{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de desembolsos">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Solicitante</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Monto (cUSD)</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Desembolso</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Tx Hash</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Vencimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((d) => (
                <tr
                  key={d.id}
                  className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {d.prestatario_nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300 font-medium">
                    {Number(d.monto).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_COLORS[d.estado] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}>
                      {ESTADO_LABELS[d.estado] ?? d.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400">
                    {formatDate(d.fecha_desembolso)}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    {d.tx_hash ? (
                      <CeloScanLink txHash={d.tx_hash} />
                    ) : (
                      <span className="text-slate-400 dark:text-gray-500 italic text-xs">Sin hash</span>
                    )}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                    {formatDate(d.fecha_vencimiento)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-gray-400">
            Página {page} de {totalPages} ({total} desembolsos)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
