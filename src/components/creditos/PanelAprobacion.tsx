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
//
// Composition over render-prop:
//   Instead of passing a `renderAvalManager` render prop, the parent component
//   manages the expanded-aval state and renders GestorAvales directly below
//   <PanelAprobacion>. This avoids prop-drilling and keeps state colocated
//   with the page that owns it.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import CeloScanLink from '@/components/shared/CeloScanLink';
import { EmptyState } from '@/components/ui';
import type { CreditoPendiente } from '@/types/database';

type PanelState = 'empty' | 'list' | 'success' | 'error';

interface PanelAprobacionProps {
  creditosIniciales: CreditoPendiente[];
  /** Credit estado map managed by parent — enables composition with GestorAvales */
  creditEstados: Record<string, string>;
  /** Called when any action changes a credit's estado (approval, aval, etc.) */
  onCreditEstadoChange: (creditoId: string, nuevoEstado: string) => void;
  /** Enable aval management UI column and per-row "Avales" button */
  enableAvalManagement?: boolean;
  /** Currently expanded aval row (managed by parent) */
  expandedAvalId?: string | null;
  /** Toggle aval expansion for a given credit */
  onToggleAval?: (creditoId: string | null) => void;
}

export default function PanelAprobacion({
  creditosIniciales,
  creditEstados,
  onCreditEstadoChange,
  enableAvalManagement = false,
  expandedAvalId = null,
  onToggleAval,
}: PanelAprobacionProps) {
  const [state, setState] = useState<PanelState>(creditosIniciales.length === 0 ? 'empty' : 'list');
  const [creditos, setCreditos] = useState<CreditoPendiente[]>(creditosIniciales);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Sync creditos when creditosIniciales changes (e.g. client-side fetch)
  useEffect(() => {
    setCreditos(creditosIniciales);

    if (creditosIniciales.length === 0) {
      setState('empty');
    } else {
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
        onCreditEstadoChange(creditoId, 'aprobado');
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

  const handleRetry = useCallback(() => {
    // Reset to list state — user picks which credit to retry
    setState(creditos.length > 0 ? 'list' : 'empty');
    setErrorMsg(null);
    setTxHash(null);
  }, [creditos.length]);

  // ==========================================================================
  // Render: empty state
  // ==========================================================================
  if (state === 'empty') {
    return (
      <EmptyState
        title="Sin créditos pendientes"
        description="No hay créditos pendientes de aprobación en este momento."
        icon={
          <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />
    );
  }

  // ==========================================================================
  // Render: success banner
  // ==========================================================================
  if (state === 'success') {
    return (
      <div
        className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4"
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
            <p className="text-green-800 dark:text-green-200 font-medium">Desembolso exitoso</p>
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
          className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4"
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
              <p className="text-red-800 dark:text-red-200 font-medium">Error en el proceso</p>
              {errorMsg && <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>}
            </div>
          </div>
        </div>

        {creditos.length > 0 && (
          <PanelTable
            creditos={creditos}
            creditEstados={creditEstados}
            isLoading={isLoading}
            rowErrors={rowErrors}
            enableAvalManagement={enableAvalManagement}
            expandedAvalId={expandedAvalId}
            onAction={handleAction}
            onToggleAval={onToggleAval}
          />
        )}
      </div>
    );
  }

  // ==========================================================================
  // Render: list state
  // ==========================================================================
  return (
    <div className="space-y-4">
      <PanelTable
        creditos={creditos}
        creditEstados={creditEstados}
        isLoading={isLoading}
        rowErrors={rowErrors}
        enableAvalManagement={enableAvalManagement}
        expandedAvalId={expandedAvalId}
        onAction={handleAction}
        onToggleAval={onToggleAval}
      />
    </div>
  );
}

// =============================================================================
// PanelRow — Individual credit row with two-step action buttons
// =============================================================================

// =============================================================================
// PanelTable — Shared table layout for both error and list states
// =============================================================================

interface PanelTableProps {
  creditos: CreditoPendiente[];
  creditEstados: Record<string, string>;
  isLoading: Record<string, boolean>;
  rowErrors: Record<string, string>;
  enableAvalManagement: boolean;
  expandedAvalId: string | null;
  onAction: (creditoId: string, estadoActual: string) => Promise<void>;
  onToggleAval?: (creditoId: string | null) => void;
}

function PanelTable({
  creditos,
  creditEstados,
  isLoading,
  rowErrors,
  enableAvalManagement,
  expandedAvalId,
  onAction,
  onToggleAval,
}: PanelTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
      <div className="overflow-x-auto">
        <table
          className="min-w-full divide-y divide-slate-100 dark:divide-gray-700"
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
              {enableAvalManagement && (
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
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {creditos.map((credito) => (
              <PanelRow
                key={credito.id}
                credito={credito}
                curEstado={creditEstados[credito.id] ?? credito.estado ?? 'pendiente'}
                isLoading={isLoading[credito.id] ?? false}
                rowError={rowErrors[credito.id] ?? null}
                enableAvalManagement={enableAvalManagement}
                expandedAvalId={expandedAvalId}
                onAction={onAction}
                onToggleAval={onToggleAval}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// PanelRow — Individual credit row with two-step action buttons
// =============================================================================

interface PanelRowProps {
  credito: CreditoPendiente;
  curEstado: string;
  isLoading: boolean;
  rowError: string | null;
  enableAvalManagement: boolean;
  expandedAvalId: string | null;
  onAction: (creditoId: string, estadoActual: string) => Promise<void>;
  onToggleAval?: (creditoId: string | null) => void;
}

function PanelRow({
  credito,
  curEstado,
  isLoading,
  rowError,
  enableAvalManagement,
  expandedAvalId,
  onAction,
  onToggleAval,
}: PanelRowProps) {
  const isApprovalAction = curEstado === 'pendiente' || curEstado === 'avalado';
  const buttonLabel = isApprovalAction ? 'Aprobar' : 'Desembolsar';
  const buttonLabelLoading = isApprovalAction ? 'Aprobando…' : 'Desembolsando…';
  const isExpanded = expandedAvalId === credito.id;

  return (
    <tr className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50">
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-950 dark:text-white font-bold">
        {credito.monto.toLocaleString('es-CO')} cUSD
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-700 dark:text-gray-200 font-semibold">
        {credito.solicitante}
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            credito.score > 80
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700'
              : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700'
          }`}
        >
          {credito.score} pts
        </span>
      </td>
      {enableAvalManagement && (
        <td className="px-6 py-4.5 whitespace-nowrap text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                curEstado === 'avalado'
                  ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-700'
                  : curEstado === 'aprobado'
                    ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-700'
                    : curEstado === 'pendiente'
                      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700'
                      : 'bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-gray-600'
              }`}
            >
              {curEstado}
            </span>
            {typeof credito.avalCount === 'number' && (
              <span
                className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/40 dark:border-blue-700"
                title="Avales activos"
              >
                {credito.avalCount}
              </span>
            )}
          </div>
        </td>
      )}
      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-medium">
        {new Date(credito.fecha).toLocaleDateString('es-CO')}
      </td>
      <td className="px-6 py-4.5 whitespace-nowrap text-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAction(credito.id, curEstado)}
              disabled={isLoading}
              className={`inline-flex items-center px-3.5 py-2 border border-transparent text-xs font-semibold rounded-lg shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer ${
                isApprovalAction
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:ring-blue-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:ring-emerald-500'
              }`}
              aria-label={`${buttonLabel} crédito de ${credito.solicitante}`}
            >
              {isLoading ? (
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
            {enableAvalManagement && credito.prestatarioId && onToggleAval && (
              <button
                onClick={() => onToggleAval(isExpanded ? null : credito.id)}
                className="inline-flex items-center px-3 py-2 border border-slate-200 dark:border-gray-600 text-xs font-semibold rounded-lg text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 transition-all duration-150 cursor-pointer"
                aria-label={isExpanded ? 'Ocultar avales' : 'Gestionar avales'}
                aria-expanded={isExpanded}
              >
                <svg
                  className={`h-3.5 w-3.5 mr-1 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium" role="alert">
              {rowError}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}