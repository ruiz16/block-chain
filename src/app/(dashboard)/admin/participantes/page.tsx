'use client';

// =============================================================================
// Admin Participantes Page — Paginated Participant List
// =============================================================================
//
// Route: /admin/participantes
//
// Displays all participants with their credit stats in a paginated table.
// States: loading → skeleton | error → alert | empty → placeholder | loaded
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { ParticipanteAdmin } from '@/app/api/admin/participantes/route';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminParticipantesPage() {
  const [data, setData] = useState<ParticipanteAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/participantes?page=${page}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? 'Error al cargar participantes');
      }
      const json = await res.json() as { data: ParticipanteAdmin[]; total: number };
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
  // Helpers
  // ==========================================================================

  const rolBadge = (rol: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
      prestatario: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700',
      aval: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700',
      prestamista: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700',
    };
    return colors[rol] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  // ==========================================================================
  // Render: loading
  // ==========================================================================

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Participantes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cargando participantes…</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Gestión de Participantes</h1>
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-red-800 dark:text-red-200 font-medium text-sm">Error al cargar participantes</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Gestión de Participantes</h1>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-12 text-center shadow-lg shadow-slate-100/50 dark:shadow-black/20">
          <svg className="h-16 w-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="text-lg font-medium text-slate-800 dark:text-gray-200 mb-1">Sin participantes</h3>
          <p className="text-slate-400 dark:text-gray-500 text-sm">No hay participantes registrados en la plataforma.</p>
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Participantes</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {total} participante{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de participantes">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Nombre</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Wallet</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Rol</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Score</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Créditos</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Prestado (cUSD)</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((p) => (
                <tr
                  key={p.id}
                  className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {p.nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-mono">
                    <span className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs">
                      {`${p.wallet_address.slice(0, 6)}…${p.wallet_address.slice(-4)}`}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${rolBadge(p.rol)}`}>
                      {p.rol}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center font-bold">
                    <span className={scoreColor(p.score_reputacion)}>{p.score_reputacion}</span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-600 dark:text-gray-300 font-medium">
                    {p.totalCreditos}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300">
                    {Number(p.totalPrestado).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    {p.activo ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 dark:text-gray-500 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600" aria-hidden="true" />
                        Inactivo
                      </span>
                    )}
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
            Página {page} de {totalPages} ({total} participantes)
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
