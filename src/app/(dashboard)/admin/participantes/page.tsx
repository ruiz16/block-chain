'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ParticipanteAdmin } from '@/app/api/admin/participantes/route';
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
import { getCeloScanAddressUrl } from '@/config/celo';

const LIMIT = 20;

export default function AdminParticipantesPage() {
  const [data, setData] = useState<ParticipanteAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipanteAdmin | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/participantes?page=${page}&limit=${LIMIT}`);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / LIMIT);

  const summary = useMemo(() => {
    const activos = data.filter((p) => p.activo).length;
    const inactivos = data.filter((p) => !p.activo).length;
    const avgScore = data.length > 0
      ? Math.round(data.reduce((sum, p) => sum + p.score_reputacion, 0) / data.length)
      : 0;
    return { activos, inactivos, avgScore };
  }, [data]);

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const scoreDot = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Participantes" subtitle="Cargando participantes…" />
        <LoadingSkeleton variant="cards" count={3} />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Participantes" />
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PageHeader title="Gestión de Participantes" />
        <EmptyState
          icon={
            <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          title="Sin participantes"
          description="No hay participantes registrados en la plataforma."
        />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Gestión de Participantes"
        subtitle={`${total} participante${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`}
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
          label="Score Promedio"
          count={summary.avgScore}
          variant="info"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          }
        />
      </SummaryGrid>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Lista de participantes">
            <thead className="bg-linear-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Nombre</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Wallet</th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Rol</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Score</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Créditos</th>
                <th scope="col" className="px-6 py-4.5 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Prestado (COPm)</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
                <th scope="col" className="px-6 py-4.5 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {data.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50 ${!p.activo ? 'bg-slate-50/50 dark:bg-gray-700/20' : ''}`}
                >
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                    {p.nombre}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-mono">
                    <span
                      className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs"
                      title={p.wallet_address}
                    >
                      {`${p.wallet_address.slice(0, 6)}…${p.wallet_address.slice(-4)}`}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <StatusBadge status={p.rol} />
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center font-bold">
                    <span className={`inline-flex items-center gap-1.5 ${scoreColor(p.score_reputacion)}`}>
                      <span className={`w-2 h-2 rounded-full ${scoreDot(p.score_reputacion)}`} aria-hidden="true" />
                      {p.score_reputacion}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center text-slate-600 dark:text-gray-300 font-medium">
                    {p.totalCreditos}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-right font-mono text-slate-600 dark:text-gray-300">
                    { '$ ' + Number(p.totalPrestado).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
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
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipant(p)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 hover:text-slate-700 dark:hover:text-gray-200 transition-colors duration-150 cursor-pointer"
                      title="Ver detalles"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} label="participantes" onPageChange={setPage} />
    </div>

      {/* ── Details Modal ── */}
      {selectedParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedParticipant(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Detalles del participante"
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">{selectedParticipant.nombre}</h3>
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    Creado {new Date(selectedParticipant.created_at).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                className="p-1.5 rounded-lg text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Wallet */}
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Wallet</p>
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-mono text-slate-800 dark:text-gray-200 break-all">
                      {selectedParticipant.wallet_address.slice(0, 6)}…${selectedParticipant.wallet_address.slice(-4)}
                    </span>
                    <a
                      // @ts-expect-error - Ignoring type error for getCeloScanAddressUrl
                      href={getCeloScanAddressUrl(selectedParticipant.wallet_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200/60 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-800 dark:hover:text-blue-200 transition-colors duration-150 cursor-pointer shrink-0"
                      aria-label="Ver billetera en CeloScan"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      CeloScan
                    </a>
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">Rol</p>
                  <StatusBadge status={selectedParticipant.rol} />
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">Score</p>
                  <p className={`text-lg font-bold ${scoreColor(selectedParticipant.score_reputacion)}`}>
                    {selectedParticipant.score_reputacion}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">Estado</p>
                  {selectedParticipant.activo ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-sm font-semibold">
                      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-gray-600" aria-hidden="true" />
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">Créditos</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-gray-200">{selectedParticipant.totalCreditos}</p>
                </div>
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5 col-span-2">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">Total Prestado</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-gray-200 font-mono">
                    ${Number(selectedParticipant.totalPrestado).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
