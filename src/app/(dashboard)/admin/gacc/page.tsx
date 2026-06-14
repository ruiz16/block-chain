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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createState, setCreateState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [createNombre, setCreateNombre] = useState('');
  const [createDescripcion, setCreateDescripcion] = useState('');
  const [createMunicipio, setCreateMunicipio] = useState('');
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const subtitle = loading
    ? 'Cargando grupos…'
    : error
      ? undefined
      : data.length === 0
        ? undefined
        : `${total} grupo${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`;

  function openCreateModal() {
    setShowCreateModal(true);
    setCreateState('idle');
    setCreateNombre('');
    setCreateDescripcion('');
    setCreateMunicipio('');
    setCodigoGenerado(null);
    setCreateError(null);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ── Header with Create button — always visible ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageHeader title="Gestión de GACCs" subtitle={subtitle} />
        {!loading && !error && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors duration-150 cursor-pointer shadow-sm shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Crear GACC
          </button>
        )}
      </div>

      {/* ── Content area — conditional ── */}
      {loading && (
        <>
          <LoadingSkeleton variant="cards" count={3} />
          <LoadingSkeleton variant="table" />
        </>
      )}

      {error && (
        <ErrorAlert message={error} onRetry={() => { setPage(1); fetchData(); }} />
      )}

      {!loading && !error && data.length === 0 && (
        <EmptyState
          icon={
            <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          }
          title="Sin GACCs"
          description="No hay grupos de ahorro y crédito registrados en la plataforma."
        />
      )}

      {!loading && !error && data.length > 0 && (
        <>
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
        </>
      )}

      {/* ── Create GACC Modal ── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Crear GACC"
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">Crear nuevo GACC</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* Error state */}
              {createState === 'error' && (
                <div className="mb-5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4" role="alert">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Error al crear el GACC</p>
                  {createError && <p className="text-sm text-red-600 dark:text-red-300 mt-1">{createError}</p>}
                  <button
                    onClick={() => setCreateState('idle')}
                    className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 hover:underline cursor-pointer"
                  >
                    Intentar de nuevo
                  </button>
                </div>
              )}

              {/* Success state */}
              {createState === 'success' && codigoGenerado && (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-slate-800 dark:text-gray-100 mb-1">GACC creado exitosamente</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">Comparte este código para que los participantes se unan:</p>
                  <div className="inline-block bg-slate-100 dark:bg-gray-900/50 px-6 py-3 rounded-xl border border-slate-200 dark:border-gray-700">
                    <span className="text-2xl font-bold tracking-widest text-slate-900 dark:text-white font-mono">
                      {codigoGenerado}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="mt-6 inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              {/* Form */}
              {createState !== 'success' && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setCreateState('submitting');
                    setCreateError(null);
                    try {
                      const res = await fetch('/api/admin/gacc', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          nombre: createNombre.trim(),
                          descripcion: createDescripcion.trim() || undefined,
                          municipio: createMunicipio,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.detail ?? data.error ?? 'Error al crear GACC');
                      setCodigoGenerado(data.grupo.codigo);
                      setCreateState('success');
                      fetchData();
                    } catch (err) {
                      setCreateError(err instanceof Error ? err.message : 'Error inesperado');
                      setCreateState('error');
                    }
                  }}
                  className="space-y-5"
                >
                  {/* Nombre */}
                  <div>
                    <label htmlFor="gacc-nombre-admin" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                      Nombre del grupo
                    </label>
                    <input
                      id="gacc-nombre-admin"
                      type="text"
                      required
                      value={createNombre}
                      onChange={(e) => setCreateNombre(e.target.value)}
                      disabled={createState === 'submitting'}
                      minLength={3}
                      maxLength={200}
                      className="block w-full rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Ej: Ahorro Solidario Guapi"
                    />
                  </div>

                  {/* Descripción */}
                  <div>
                    <label htmlFor="gacc-desc-admin" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                      Descripción <span className="text-slate-400 dark:text-gray-500 font-normal">(opcional)</span>
                    </label>
                    <textarea
                      id="gacc-desc-admin"
                      rows={3}
                      maxLength={500}
                      value={createDescripcion}
                      onChange={(e) => setCreateDescripcion(e.target.value)}
                      disabled={createState === 'submitting'}
                      className="block w-full rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Propósito del grupo de ahorro"
                    />
                    <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">{createDescripcion.length}/500</p>
                  </div>

                  {/* Municipio */}
                  <div>
                    <label htmlFor="gacc-municipio" className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                      Municipio
                    </label>
                    <select
                      id="gacc-municipio"
                      required
                      value={createMunicipio}
                      onChange={(e) => setCreateMunicipio(e.target.value)}
                      disabled={createState === 'submitting'}
                      className="block w-full rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="" disabled>Seleccionar municipio</option>
                      <option value="guapi">Guapi</option>
                      <option value="timbiqui">Timbiquí</option>
                    </select>
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      disabled={createState === 'submitting'}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createState === 'submitting'}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {createState === 'submitting' ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Creando…
                        </>
                      ) : 'Crear GACC'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
