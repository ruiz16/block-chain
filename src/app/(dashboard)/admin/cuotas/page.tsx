'use client';

// =============================================================================
// Admin Cuotas Page — Paginated Cuotas List Grouped by Crédito
// =============================================================================
//
// Route: /admin/cuotas
//
// Displays cuotas grouped by crédito so each credit's payment schedule is
// visible as a unit. Each group has a header showing the prestatario name,
// cuota progress, and a health indicator (all pagadas → green, mixed → yellow,
// any overdue → red).
//
// Top summary cards show aggregate counts + totals per estado for the current
// page data.
//
// States: loading → skeleton | error → alert | empty → placeholder | loaded
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CuotaAdmin } from '@/app/api/admin/cuotas/route';
import {
  StatusBadge,
  HealthIndicator,
  ProgressBar,
  SummaryCard as UiSummaryCard,
  SummaryGrid,
  PageHeader,
  LoadingSkeleton,
  ErrorAlert,
  EmptyState,
  Pagination,
} from '@/components/ui';
import type { Health } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CuotaGroup {
  credito_id: string;
  prestatario_nombre: string;
  total_cuotas: number;
  cuotas: CuotaAdmin[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatCurrency(value: string | number): string {
  return Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2 });
}

function diasAtraso(fechaVencimiento: string): number {
  const vence = new Date(fechaVencimiento);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  vence.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoy.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Main Component
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

  // ── Group by credito_id ────────────────────────────────────────────────

  const groups = useMemo<CuotaGroup[]>(() => {
    const map = new Map<string, CuotaAdmin[]>();
    for (const cuota of data) {
      const existing = map.get(cuota.credito_id);
      if (existing) {
        existing.push(cuota);
      } else {
        map.set(cuota.credito_id, [cuota]);
      }
    }

    return Array.from(map.entries())
      .map(([credito_id, cuotas]) => {
        const first = cuotas[0]!;
        return {
          credito_id,
          prestatario_nombre: first.prestatario_nombre,
          total_cuotas: first.total_cuotas,
          cuotas: cuotas.sort((a, b) => a.numero_cuota - b.numero_cuota),
        };
      })
      .sort((a, b) => a.prestatario_nombre.localeCompare(b.prestatario_nombre));
  }, [data]);

  // ── Summary computed from current page ──────────────────────────────────

  const summary = useMemo(() => {
    let pendientes = 0, pagadas = 0, vencidas = 0;
    let totalPendientes = 0, totalPagadas = 0, totalVencidas = 0;

    for (const cuota of data) {
      const monto = Number(cuota.monto_cuota);
      switch (cuota.estado) {
        case 'pendiente':
          pendientes++;
          totalPendientes += monto;
          break;
        case 'pagada':
          pagadas++;
          totalPagadas += monto;
          break;
        case 'vencida':
          vencidas++;
          totalVencidas += monto;
          break;
      }
    }

    return { pendientes, pagadas, vencidas, totalPendientes, totalPagadas, totalVencidas };
  }, [data]);

  const totalPages = Math.ceil(total / limit);

  // ==========================================================================
  // Helpers per-group
  // ==========================================================================

  function groupHealth(cuotas: CuotaAdmin[]): Health {
    let hasVencida = false;
    let hasPendiente = false;
    for (const c of cuotas) {
      if (c.estado === 'vencida') hasVencida = true;
      if (c.estado === 'pendiente') hasPendiente = true;
    }
    if (hasVencida) return 'vencido';
    if (hasPendiente) return 'mixto';
    return 'al-dia';
  }

  function cuotasPagadas(cuotas: CuotaAdmin[]): number {
    return cuotas.filter(c => c.estado === 'pagada').length;
  }

  // ==========================================================================
  // Render: loading
  // ==========================================================================

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Cuotas" subtitle="Cargando cuotas…" />
        <LoadingSkeleton variant="cards" count={3} />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  // ==========================================================================
  // Render: error
  // ==========================================================================

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Cuotas" />
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      </div>
    );
  }

  // ==========================================================================
  // Render: empty
  // ==========================================================================

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Cuotas" />
        <EmptyState
          title="Sin cuotas"
          description="No hay cuotas registradas en la plataforma."
        />
      </div>
    );
  }

  // ==========================================================================
  // Render: loaded
  // ==========================================================================

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <PageHeader
          title="Gestión de Cuotas"
          subtitle={`${total} cuota${total !== 1 ? 's' : ''} — ${groups.length} crédito${groups.length !== 1 ? 's' : ''} en esta página`}
        />
        <div className="flex items-center gap-2 shrink-0">
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

      {/* ── Summary Cards ── */}
      <SummaryGrid columns={3}>
        <UiSummaryCard
          label="Pendientes"
          count={summary.pendientes}
          total={`$${formatCurrency(summary.totalPendientes)}`}
          variant="warning"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <UiSummaryCard
          label="Pagadas"
          count={summary.pagadas}
          total={`$${formatCurrency(summary.totalPagadas)}`}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <UiSummaryCard
          label="Vencidas"
          count={summary.vencidas}
          total={`$${formatCurrency(summary.totalVencidas)}`}
          variant="danger"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          }
        />
      </SummaryGrid>

      {/* ── Credit Groups ── */}
      {groups.map((group) => {
        const health = groupHealth(group.cuotas);
        const pagadas = cuotasPagadas(group.cuotas);

        return (
          <div
            key={group.credito_id}
            className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20 mb-6 overflow-hidden transition-shadow duration-200 hover:shadow-slate-200/60 dark:hover:shadow-black/40"
          >
            {/* ── Credit Header ── */}
            <div className="px-6 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{group.prestatario_nombre}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    ID: {group.credito_id.slice(0, 8)}…
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <ProgressBar current={pagadas} total={group.cuotas.length} />
                <HealthIndicator health={health} />
              </div>
            </div>

            {/* ── Cuotas Table ── */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label={`Cuotas de ${group.prestatario_nombre}`}>
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-gray-800/50">
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Vencimiento</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Monto</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Capital</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Interés</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Saldo</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Pago</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {group.cuotas.map((c) => {
                    const atraso = c.estado !== 'pagada' ? diasAtraso(c.fecha_vencimiento) : 0;

                    return (
                      <tr
                        key={c.id}
                        className={`
                          transition-colors duration-150
                          ${c.estado === 'vencida' ? 'bg-red-50/40 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30' : ''}
                          ${c.estado === 'pagada' ? 'hover:bg-slate-50/70 dark:hover:bg-gray-700/50' : 'hover:bg-slate-50/70 dark:hover:bg-gray-700/50'}
                        `}
                      >
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm tabular-nums font-medium text-slate-700 dark:text-gray-300">
                          {c.numero_cuota}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400">
                          {formatDate(c.fecha_vencimiento)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-mono text-slate-700 dark:text-gray-300 font-medium tabular-nums">
                          ${formatCurrency(c.monto_cuota)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400 tabular-nums">
                          ${formatCurrency(c.monto_capital)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400 tabular-nums">
                          ${formatCurrency(c.monto_interes)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-mono text-slate-500 dark:text-gray-400 tabular-nums">
                          ${formatCurrency(c.saldo_restante)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-center">
                          <StatusBadge status={c.estado} />
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 tabular-nums">
                          {formatDate(c.fecha_pago)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-sm text-center tabular-nums">
                          {c.estado === 'vencida' ? (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              {atraso}d
                            </span>
                          ) : c.estado === 'pagada' ? (
                            <span className="text-emerald-500 dark:text-emerald-400">—</span>
                          ) : (
                            <span className="text-slate-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Pagination ── */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        label="cuotas"
        onPageChange={setPage}
      />
    </div>
  );
}
