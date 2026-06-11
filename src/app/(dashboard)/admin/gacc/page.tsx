'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GaccAdmin } from '@/app/api/admin/gacc/route';
import {
  PageHeader,
  SummaryCard,
  SummaryGrid,
  LoadingSkeleton,
  ErrorAlert,
  EmptyState,
  Pagination,
} from '@/components/ui';

export default function AdminGaccPage() {
  const [data, setData] = useState<GaccAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gacc?page=${page}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? 'Error al cargar GACCs');
      }
      const json = await res.json() as { data: GaccAdmin[]; total: number };
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

  const summary = useMemo(() => {
    const activos = data.filter((g) => g.activo).length;
    const inactivos = data.filter((g) => !g.activo).length;
    const totalMiembros = data.reduce((sum, g) => sum + g.total_miembros, 0);
    return { activos, inactivos, totalMiembros };
  }, [data]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de GACCs" subtitle="Cargando grupos…" />
        <LoadingSkeleton variant="cards" count={3} />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de GACCs" />
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de GACCs" />
        <EmptyState
          icon={
            <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          }
          title="Sin GACCs"
          description="No hay grupos de ahorro y crédito registrados en la plataforma."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Gestión de GACCs"
        subtitle={`${total} grupo${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
      />

      <SummaryGrid columns={3}>
        <SummaryCard
          label="Activos"
          count={summary.activos}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          label="Inactivos"
          count={summary.inactivos}
          variant="danger"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          label="Total Miembros"
          count={summary.totalMiembros}
          variant="info"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
      </SummaryGrid>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de GACCs">
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Nombre</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Código</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Municipio</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Creador</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Miembros</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Validados</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((g) => (
                <tr
                  key={g.id}
                  className={`transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50 ${!g.activo ? 'bg-slate-50/50 dark:bg-gray-700/20' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-slate-800 dark:text-gray-200">{g.nombre}</div>
                    {g.descripcion && (
                      <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5 max-w-xs truncate">{g.descripcion}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs font-mono">
                      {g.codigo}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400">
                    {g.municipio ?? '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-gray-300">
                    {g.creador_nombre}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-slate-700 dark:text-gray-200">
                    {g.total_miembros}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className={`font-medium ${
                      g.miembros_validados === g.total_miembros && g.total_miembros > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {g.miembros_validados}
                    </span>
                    <span className="text-slate-400 dark:text-gray-500 text-xs"> / {g.total_miembros}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {g.activo ? (
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

      <Pagination page={page} totalPages={totalPages} total={total} label="grupos" onPageChange={setPage} />
    </div>
  );
}
