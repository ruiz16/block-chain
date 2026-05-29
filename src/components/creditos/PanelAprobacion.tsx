'use client';

// =============================================================================
// PanelAprobacion — Credit Approval Panel (Two-Step Flow)
// =============================================================================
//
// A client component with 5 explicit states:
//
//   loading    — Skeleton spinner (initial data load)
//   empty      — No pending credits message
//   list       — Table of credits with action buttons per row
//   success    — Green banner with CeloScan link (auto-dismiss 5s)
//   error      — Red banner with error detail + [Reintentar] button (global)
//
// Two-step action flow per row:
//   estado=pendiente|avalado → [Aprobar] button → PATCH /api/creditos/{id}/aprobar
//   estado=aprobado          → [Desembolsar] button → POST /api/desembolso
//
// Per-row loading state via isLoading map, per-row inline errors via rowErrors map.
// =============================================================================

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import CeloScanLink from '@/components/shared/CeloScanLink';
import type { CreditoPendiente } from '@/types/database';

type PanelState = 'loading' | 'empty' | 'list' | 'success' | 'error';

interface PanelAprobacionProps {
  creditosIniciales: CreditoPendiente[];
  /**
   * Optional render prop for per-row aval management (GestorAvales).
   * The third argument `onEstadoChange` should be passed to GestorAvales
   * to keep the parent in sync with aval state transitions.
   */
  renderAvalManager?: (
    creditoId: string,
    prestatarioId: string,
    onEstadoChange: (nuevoEstado: string) => void,
  ) => ReactNode;
}

export default function PanelAprobacion({
  creditosIniciales,
  renderAvalManager,
}: PanelAprobacionProps) {
  const [state, setState] = useState<PanelState>('loading');
  const [creditos, setCreditos] = useState<CreditoPendiente[]>(creditosIniciales);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creditEstados, setCreditEstados] = useState<Record<string, string>>({});
  const [expandedAval, setExpandedAval] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Sync creditos when creditosIniciales changes (e.g. client-side fetch)
  useEffect(() => {
    setCreditos(creditosIniciales);

    if (creditosIniciales.length === 0) {
      setState('empty');
    } else {
      const estados: Record<string, string> = {};
      creditosIniciales.forEach((c) => {
        if (c.estado) estados[c.id] = c.estado;
      });
      setCreditEstados(estados);
      setState('list');
    }
  }, [creditosIniciales]);

  // Auto-dismiss success banner after 5 seconds
  useEffect(() => {
    if (state !== 'success') return;

    const timer = setTimeout(() => {
      setState(creditos.length > 0 ? 'list' : 'empty');
      setTxHash(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [state, creditos.length]);

  // ==========================================================================
  // Two-step action handler: routes to approval or disbursement per estado
  // ==========================================================================
  const handleAction = useCallback(async (creditoId: string, estadoActual: string) => {
    // Per-row loading — only this row is affected
    setIsLoading((prev) => ({ ...prev, [creditoId]: true }));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[creditoId];
      return next;
    });
    setErrorMsg(null);

    try {
      if (estadoActual === 'pendiente' || estadoActual === 'avalado') {
        // --- Step 1: APPROVAL ---
        const response = await fetch(`/api/creditos/${creditoId}/aprobar`, {
          method: 'PATCH',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al aprobar el crédito');
        }

        // Update estado in local state — row stays in list so admin can then desembolsar
        setCreditEstados((prev) => ({ ...prev, [creditoId]: 'aprobado' }));
      } else if (estadoActual === 'aprobado') {
        // --- Step 2: DISBURSEMENT ---
        const response = await fetch('/api/desembolso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credito_id: creditoId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al procesar el desembolso');
        }

        // Success — remove row from list and show success banner
        setTxHash(data.tx_hash);
        setCreditos((prev) => prev.filter((c) => c.id !== creditoId));
        setState('success');
      }
    } catch (err) {
      // Per-row inline error instead of global error banner
      setRowErrors((prev) => ({
        ...prev,
        [creditoId]: err instanceof Error ? err.message : 'Error inesperado',
      }));
    } finally {
      setIsLoading((prev) => ({ ...prev, [creditoId]: false }));
    }
  }, []);

  const handleAvalEstadoChange = useCallback((creditoId: string, nuevoEstado: string) => {
    setCreditEstados((prev) => ({ ...prev, [creditoId]: nuevoEstado }));
  }, []);

  const handleRetry = useCallback(() => {
    // Reset to list state — user picks which credit to retry
    setState(creditos.length > 0 ? 'list' : 'empty');
    setErrorMsg(null);
    setTxHash(null);
  }, [creditos.length]);

  // ==========================================================================
  // Render: loading state
  // ==========================================================================
  if (state === 'loading') {
    return (
      <div
        className="flex items-center justify-center p-8"
        aria-busy="true"
        role="status"
      >
        <svg
          className="animate-spin h-8 w-8 text-blue-600 mr-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-gray-600">Cargando créditos pendientes…</span>
      </div>
    );
  }

  // ==========================================================================
  // Render: empty state
  // ==========================================================================
  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <svg
          className="h-16 w-16 text-gray-300 mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <p className="text-gray-500 text-lg">No hay créditos pendientes de aprobación</p>
      </div>
    );
  }

  // ==========================================================================
  // Render: success banner
  // ==========================================================================
  if (state === 'success') {
    return (
      <div
        className="rounded-md bg-green-50 border border-green-200 p-4"
        role="alert"
      >
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-green-500 mt-0.5 mr-3 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <p className="text-green-800 font-medium">Desembolso exitoso</p>
            {txHash && <CeloScanLink txHash={txHash} />}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: error state (global — only used if a non-row-specific error occurs)
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="space-y-4">
        <div
          className="rounded-md bg-red-50 border border-red-200 p-4"
          role="alert"
        >
          <div className="flex items-start">
            <svg
              className="h-5 w-5 text-red-500 mt-0.5 mr-3 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-red-800 font-medium">Error en el proceso</p>
              {errorMsg && <p className="text-red-600 text-sm mt-1">{errorMsg}</p>}
            </div>
          </div>
        </div>

        {creditos.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-100/40">
            <div className="overflow-x-auto">
              <table
                className="min-w-full divide-y divide-slate-100"
                aria-label="Créditos pendientes"
              >
                <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Monto
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Prestatario
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Score
                    </th>
                    {renderAvalManager && (
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Estado
                      </th>
                    )}
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Fecha solicitud
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {creditos.map((credito) => (
                    <PanelRow
                      key={credito.id}
                      credito={credito}
                      creditEstados={creditEstados}
                      isLoading={isLoading}
                      rowErrors={rowErrors}
                      expandedAval={expandedAval}
                      renderAvalManager={renderAvalManager}
                      onAction={handleAction}
                      onToggleAval={setExpandedAval}
                      onAvalEstadoChange={handleAvalEstadoChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // Render: list state
  // ==========================================================================
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-100/40">
        <div className="overflow-x-auto">
          <table
            className="min-w-full divide-y divide-slate-100"
            aria-label="Créditos pendientes de aprobación"
          >
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Monto
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Prestatario
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Score
                </th>
                {renderAvalManager && (
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Estado
                  </th>
                )}
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Fecha solicitud
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {creditos.map((credito) => (
                <PanelRow
                  key={credito.id}
                  credito={credito}
                  creditEstados={creditEstados}
                  isLoading={isLoading}
                  rowErrors={rowErrors}
                  expandedAval={expandedAval}
                  renderAvalManager={renderAvalManager}
                  onAction={handleAction}
                  onToggleAval={setExpandedAval}
                  onAvalEstadoChange={handleAvalEstadoChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expandable aval manager per credit */}
      {expandedAval && renderAvalManager && (() => {
        const credito = creditos.find((c) => c.id === expandedAval);
        if (!credito || !credito.prestatarioId) return null;

        return (
          <div className="border border-gray-200 rounded-md bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">
                Gestión de avales — {credito.solicitante}
              </h3>
              <button
                onClick={() => setExpandedAval(null)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Cerrar gestión de avales"
              >
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {renderAvalManager(credito.id, credito.prestatarioId, (nuevoEstado) => {
              handleAvalEstadoChange(credito.id, nuevoEstado);
            })}
          </div>
        );
      })()}
    </div>
  );
}

// =============================================================================
// PanelRow — Individual credit row with two-step action buttons
// =============================================================================

interface PanelRowProps {
  credito: CreditoPendiente;
  creditEstados: Record<string, string>;
  isLoading: Record<string, boolean>;
  rowErrors: Record<string, string>;
  expandedAval: string | null;
  renderAvalManager?: (
    creditoId: string,
    prestatarioId: string,
    onEstadoChange: (nuevoEstado: string) => void,
  ) => ReactNode;
  onAction: (creditoId: string, estadoActual: string) => Promise<void>;
  onToggleAval: (creditoId: string | null) => void;
  onAvalEstadoChange: (creditoId: string, nuevoEstado: string) => void;
}

function PanelRow({
  credito,
  creditEstados,
  isLoading,
  rowErrors,
  expandedAval,
  renderAvalManager,
  onAction,
  onToggleAval,
  onAvalEstadoChange,
}: PanelRowProps) {
  const curEstado: string = creditEstados[credito.id] ?? credito.estado ?? 'pendiente';
  const isRowLoading = isLoading[credito.id] ?? false;
  const rowError = rowErrors[credito.id] ?? null;

  const isApprovalAction = curEstado === 'pendiente' || curEstado === 'avalado';
  const buttonLabel = isApprovalAction ? 'Aprobar' : 'Desembolsar';
  const buttonLabelLoading = isApprovalAction ? 'Aprobando…' : 'Desembolsando…';

  return (
    <tr key={credito.id} className="transition-colors duration-150 hover:bg-slate-50/70">
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-950 font-bold">
        {credito.monto.toLocaleString('es-CO')} cUSD
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-700 font-semibold">
        {credito.solicitante}
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            credito.score > 80
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
              : 'bg-amber-50 text-amber-700 border border-amber-200/60'
          }`}
        >
          {credito.score} pts
        </span>
      </td>
      {renderAvalManager && (
        <td className="px-6 py-4.5 whitespace-nowrap text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                curEstado === 'avalado'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                  : curEstado === 'aprobado'
                    ? 'bg-sky-50 text-sky-700 border border-sky-200/60'
                    : curEstado === 'pendiente'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                      : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              {curEstado}
            </span>
            {typeof credito.avalCount === 'number' && (
              <span
                className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/40"
                title="Avales activos"
              >
                {credito.avalCount}
              </span>
            )}
          </div>
        </td>
      )}
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 font-medium">
        {new Date(credito.fecha).toLocaleDateString('es-CO')}
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAction(credito.id, curEstado)}
              disabled={isRowLoading}
              className={`inline-flex items-center px-3.5 py-2 border border-transparent text-xs font-semibold rounded-lg shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer ${
                isApprovalAction
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:ring-blue-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:ring-emerald-500'
              }`}
              aria-label={`${buttonLabel} crédito de ${credito.solicitante}`}
            >
              {isRowLoading ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 mr-1.5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {buttonLabelLoading}
                </>
              ) : (
                buttonLabel
              )}
            </button>
            {renderAvalManager && credito.prestatarioId && (
              <button
                onClick={() => onToggleAval(expandedAval === credito.id ? null : credito.id)}
                className="inline-flex items-center px-3 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-150 cursor-pointer"
                aria-label={expandedAval === credito.id ? 'Ocultar avales' : 'Gestionar avales'}
                aria-expanded={expandedAval === credito.id}
              >
                <svg
                  className={`h-3.5 w-3.5 mr-1 transition-transform ${expandedAval === credito.id ? 'rotate-90' : ''}`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Avales
              </button>
            )}
          </div>
          {/* Per-row inline error */}
          {rowError && (
            <p className="text-xs text-red-600 mt-1 font-medium" role="alert">
              {rowError}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}