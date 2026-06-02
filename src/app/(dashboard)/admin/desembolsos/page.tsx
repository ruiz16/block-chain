'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DesembolsoAdmin } from '@/app/api/admin/desembolsos/route';
import CeloScanLink from '@/components/shared/CeloScanLink';
import {
  PageHeader,
  SummaryCard,
  SummaryGrid,
  StatusBadge,
  LoadingSkeleton,
  ErrorAlert,
  EmptyState,
  Pagination,
} from '@/components/ui';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

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

  const summaries = useMemo(() => ({
    desembolsados: data.filter((d) => d.estado === 'desembolsado').length,
    pagados: data.filter((d) => d.estado === 'pagado').length,
    defaults: data.filter((d) => d.estado === 'default').length,
  }), [data]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <LoadingSkeleton variant="cards" count={3} />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Desembolsos" />
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Desembolsos" />
        <EmptyState
          title="Sin desembolsos"
          description="No hay desembolsos realizados aún."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Desembolsos"
        subtitle={`${total} desembolso${total !== 1 ? 's' : ''} realizado${total !== 1 ? 's' : ''}`}
      />

      <SummaryGrid columns={3}>
        <SummaryCard label="Desembolsados" count={summaries.desembolsados} variant="success" />
        <SummaryCard label="Pagados" count={summaries.pagados} variant="success" />
        <SummaryCard label="Default" count={summaries.defaults} variant="danger" />
      </SummaryGrid>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de desembolsos">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Solicitante</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Monto (COP)</th>
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
                  className={`transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50${d.estado === 'default' ? ' bg-red-50/50 dark:bg-red-900/10' : ''}`}
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {d.prestatario_nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300 font-semibold">
                    ${Number(d.monto_cop).toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-400 dark:text-gray-500">
                    {Number(d.monto).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    <StatusBadge status={d.estado} />
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

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        label="desembolsos"
        onPageChange={setPage}
      />
    </div>
  );
}
