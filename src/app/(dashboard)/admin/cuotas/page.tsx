'use client';

// =============================================================================
// Admin Cuotas Page — Paginated Cuotas List
// =============================================================================
//
// Route: /admin/cuotas
//
// Displays all cuotas across all participants with status, amounts, and
// payment info. Includes optional filtering by estado.
//
// States: loading → skeleton | error → alert | empty → placeholder | loaded
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { CuotaAdmin } from '@/app/api/admin/cuotas/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  vencida: 'Vencida',
};

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700',
  pagada: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700',
  vencida: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700',
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

export default function AdminCuotasPage() {
  const [data, setData] = useState<CuotaAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterEstado, setFilterEstado] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = `/api/admin/cuotas?page=${page}&limit=${limit}`;
      if (filterEstado) {
        url += `&estado=${filterEstado}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? 'Error al cargar cuotas');
      }
      const json = await res.json() as { data: CuotaAdmin[]; total: number };
      setData(json.data);
      setTotal(json.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [page, filterEstado]);

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Cuotas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cargando cuotas…</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Gestión de Cuotas</h1>
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-red-800 dark:text-red-200 font-medium text-sm">Error al cargar cuotas</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Gestión de Cuotas</h1>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-12 text-center shadow-lg shadow-slate-100/50 dark:shadow-black/20">
          <svg className="h-16 w-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-slate-800 dark:text-gray-200 mb-1">Sin cuotas</h3>
          <p className="text-slate-400 dark:text-gray-500 text-sm">No hay cuotas registradas en la plataforma.</p>
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
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Cuotas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {total} cuota{total !== 1 ? 's' : ''} registrada{total !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="estado-filter" className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Filtro:
          </label>
          <select
            id="estado-filter"
            value={filterEstado}
            onChange={(e) => { setFilterEstado(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            <option value="pendiente">Pendientes</option>
            <option value="pagada">Pagadas</option>
            <option value="vencida">Vencidas</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de cuotas">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Prestatario</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Cuota</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Monto</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Capital</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Interés</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Saldo Rest.</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Vencimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {c.prestatario_nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                    {c.numero_cuota} / {c.total_cuotas}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300 font-medium">
                    {Number(c.monto_cuota).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400">
                    {Number(c.monto_capital).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400">
                    {Number(c.monto_interes).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400">
                    {Number(c.saldo_restante).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_COLORS[c.estado] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      {ESTADO_LABELS[c.estado] ?? c.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                    {formatDate(c.fecha_vencimiento)}
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
            Página {page} de {totalPages} ({total} cuotas)
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
