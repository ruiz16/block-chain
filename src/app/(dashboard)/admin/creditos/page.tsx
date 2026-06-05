'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CreditoAdmin } from '@/app/api/admin/creditos/route';
import PageHeader from '@/components/ui/PageHeader';
import SummaryCard from '@/components/ui/SummaryCard';
import SummaryGrid from '@/components/ui/SummaryGrid';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ErrorAlert from '@/components/ui/ErrorAlert';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function AdminCreditosPage() {
  const [data, setData] = useState<CreditoAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/creditos?page=${page}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? 'Error al cargar créditos');
      }
      const json = await res.json() as { data: CreditoAdmin[]; total: number };
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

  const summaryCards = useMemo(() => {
    const pendientesAvalados = data.filter((c) => c.estado === 'pendiente' || c.estado === 'avalado');
    const aprobados = data.filter((c) => c.estado === 'aprobado');
    const desembolsados = data.filter((c) => c.estado === 'desembolsado');
    const pagados = data.filter((c) => c.estado === 'pagado');
    const defaults = data.filter((c) => c.estado === 'default');

    return { pendientesAvalados, aprobados, desembolsados, pagados, defaults };
  }, [data]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Créditos" subtitle="Cargando créditos…" />
        <LoadingSkeleton variant="cards" count={4} />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Créditos" />
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Créditos" />
        <EmptyState title="Sin créditos" description="No hay créditos solicitados en la plataforma." />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Gestión de Créditos"
        subtitle={`${total} crédito${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
      />

      <SummaryGrid columns={4}>
        <SummaryCard
          label="Pendientes / Avalados"
          count={summaryCards.pendientesAvalados.length}
          variant="warning"
        />
        <SummaryCard
          label="Aprobados"
          count={summaryCards.aprobados.length}
          variant="info"
        />
        <SummaryCard
          label="Desembolsados"
          count={summaryCards.desembolsados.length}
          variant="success"
        />
        <SummaryCard
          label="Pagados"
          count={summaryCards.pagados.length}
          variant="success"
        />
      </SummaryGrid>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de créditos">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Solicitante</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Monto (COPm)</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Plazo</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Vencimiento</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Solicitud</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((c) => (
                <tr
                  key={c.id}
                  className={`transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50 ${
                    c.estado === 'default' ? 'bg-red-50/60 dark:bg-red-900/15' : ''
                  }`}
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {c.prestatario_nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300 font-semibold">
                    ${Number(c.monto).toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    <StatusBadge status={c.estado} />
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                    {c.plazo_dias} días
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                    {formatDate(c.fecha_vencimiento)}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400">
                    {formatDate(c.fecha_solicitud)}
                  </td>
                  <td className="px-6 py-4.5 text-sm text-slate-500 dark:text-gray-400 max-w-[200px] truncate">
                    {c.descripcion ?? '—'}
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
        label="créditos"
        onPageChange={setPage}
      />
    </div>
  );
}
