'use client';

// =============================================================================
// PanelPagos — Borrower Payment Dashboard
// =============================================================================
//
// A client component with 6 explicit states:
//
//   loading     — Spinner while fetching credits from API
//   empty       — No credits at all: "No tienes créditos activos"
//   no-pending  — Credits exist but none in 'desembolsado': "No tienes pagos pendientes"
//   list        — Table of desembolsado credits with [Registrar Pago] per row
//   submitting  — Disabled state while payment transaction is in flight
//   success     — Green checkmark banner (auto-dismiss 5s)
//   error       — Red banner with error detail + [Reintentar] button
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { cusdToCop } from '@/config/currency';
import CeloScanLink from '@/components/shared/CeloScanLink';
import type { CreditoRow } from '@/types/database';

type PanelState = 'loading' | 'empty' | 'no-pending' | 'list' | 'submitting' | 'success' | 'error';

interface CreditWithActions extends CreditoRow {
  _openForm?: boolean;
}

// =============================================================================
// Error message mapping (Spanish, user-friendly)
// =============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  TX_NO_ENCONTRADA: 'La transacción no existe en la blockchain',
  TX_REVERTIDA: 'La transacción fue revertida en la blockchain',
  TX_DESTINO_INVALIDO: 'La transacción no es al contrato de cUSD',
  TX_MONTO_INSUFICIENTE: 'El monto enviado es menor al crédito',
  TX_BENEFICIARIO_INVALIDO: 'El destinatario no es la wallet de la plataforma',
  ESTADO_INCORRECTO: 'El crédito no está en estado de pago pendiente',
  YA_PAGADO: 'Este crédito ya fue pagado',
  TX_HASH_DUPLICADO: 'Este hash de transacción ya fue registrado',
  ERROR_INTERNO: 'Error del servidor. Intenta de nuevo más tarde',
};

const NETWORK_ERROR = 'Error de conexión. Verifica tu conexión a internet';

const TX_HASH_REGEX = /^0x[a-f0-9]{64}$/i;

// =============================================================================
// Component
// =============================================================================

export default function PanelPagos() {
  const [state, setState] = useState<PanelState>('loading');
  const [allCreditos, setAllCreditos] = useState<CreditWithActions[]>([]);
  const [txHashInput, setTxHashInput] = useState('');
  const [txHashError, setTxHashError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentCreditoId, setCurrentCreditoId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch credits on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchCreditos() {
      try {
        setState('loading');
        const res = await fetch('/api/mis-creditos');

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const rows = (data.creditos ?? []) as CreditWithActions[];

        if (cancelled) return;

        setAllCreditos(rows);

        if (rows.length === 0) {
          setState('empty');
        } else {
          const pendientes = rows.filter((c) => c.estado === 'desembolsado');
          if (pendientes.length === 0) {
            setState('no-pending');
          } else {
            setState('list');
          }
        }
      } catch {
        if (!cancelled) {
          setErrorMsg(NETWORK_ERROR);
          setState('error');
        }
      }
    }

    fetchCreditos();
    return () => { cancelled = true; };
  }, []);

  // ------------------------------------------------------------------
  // Auto-dismiss success banner after 5 seconds
  // ------------------------------------------------------------------
  useEffect(() => {
    if (state !== 'success') return;

    const timer = setTimeout(() => {
      setCurrentCreditoId(null);
      setTxHashInput('');
      setTxHashError(null);

      const pendientes = allCreditos.filter((c) => c.estado === 'desembolsado');
      setState(pendientes.length > 0 ? 'list' : 'no-pending');
    }, 5000);

    return () => clearTimeout(timer);
  }, [state, allCreditos]);

  // ------------------------------------------------------------------
  // Get only desembolsado credits for the list
  // ------------------------------------------------------------------
  const creditosPendientes = allCreditos.filter(
    (c) => c.estado === 'desembolsado',
  );

  // ------------------------------------------------------------------
  // Inline form handlers
  // ------------------------------------------------------------------
  const openForm = useCallback((creditoId: string) => {
    setCurrentCreditoId(creditoId);
    setTxHashInput('');
    setTxHashError(null);
    setErrorMsg(null);
  }, []);

  const closeForm = useCallback(() => {
    setCurrentCreditoId(null);
    setTxHashInput('');
    setTxHashError(null);
    setErrorMsg(null);
  }, []);

  // ------------------------------------------------------------------
  // Client-side validation
  // ------------------------------------------------------------------
  const validateTxHash = useCallback((hash: string): string | null => {
    if (!hash.startsWith('0x')) {
      return 'El hash debe comenzar con 0x';
    }
    if (hash.length !== 66) {
      return 'El hash debe ser un hex válido de 64 caracteres';
    }
    if (!TX_HASH_REGEX.test(hash)) {
      return 'El hash contiene caracteres no válidos';
    }
    return null;
  }, []);

  const handleTxHashChange = useCallback((value: string) => {
    setTxHashInput(value);
    if (txHashError) {
      setTxHashError(null);
    }
  }, [txHashError]);

  // ------------------------------------------------------------------
  // Submit payment
  // ------------------------------------------------------------------
  const handleSubmit = useCallback(async (creditoId: string) => {
    // Client-side validation
    const validationError = validateTxHash(txHashInput);
    if (validationError) {
      setTxHashError(validationError);
      return;
    }

    setState('submitting');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credito_id: creditoId,
          tx_hash: txHashInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorCode = data.error as string;
        const userMessage = ERROR_MESSAGES[errorCode] ?? data.detail ?? 'Error inesperado';
        throw new Error(userMessage);
      }

      // Success — remove this credit from the list
      setAllCreditos((prev) =>
        prev.map((c) =>
          c.id === creditoId ? { ...c, estado: 'pagado' as const } : c,
        ),
      );
      setCurrentCreditoId(null);
      setTxHashInput('');
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setState('error');
    }
  }, [txHashInput, validateTxHash]);

  const handleRetry = useCallback(() => {
    const pendientes = allCreditos.filter((c) => c.estado === 'desembolsado');
    setState(pendientes.length > 0 ? 'list' : 'no-pending');
    setErrorMsg(null);
  }, [allCreditos]);

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
        <span className="text-gray-600 dark:text-gray-300">Cargando tus créditos…</span>
      </div>
    );
  }

  // ==========================================================================
  // Render: empty state (no credits at all)
  // ==========================================================================
  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <svg
          className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4"
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
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500 dark:text-gray-400 text-lg">No tienes créditos activos</p>
      </div>
    );
  }

  // ==========================================================================
  // Render: no-pending state (credits exist but none in desembolsado)
  // ==========================================================================
  if (state === 'no-pending') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <svg
          className="h-16 w-16 text-green-300 dark:text-green-600 mb-4"
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
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500 dark:text-gray-400 text-lg">No tienes pagos pendientes</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Todos tus créditos están al día</p>
      </div>
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
            <p className="text-green-800 dark:text-green-200 font-medium">Pago registrado exitosamente</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: error banner
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
              <p className="text-red-800 dark:text-red-200 font-medium">Error al registrar el pago</p>
              {errorMsg && <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRetry}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500"
          >
            <svg
              className="h-3.5 w-3.5 mr-1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: list state (and submitting state overlays on list)
  // ==========================================================================
  const isSubmitting = state === 'submitting';

  if (creditosPendientes.length === 0) {
    // Fallback — transition to no-pending if list is empty
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-lg">No tienes pagos pendientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="overflow-x-auto">
          <table
            className="min-w-full divide-y divide-slate-100 dark:divide-gray-700"
            aria-label="Créditos pendientes de pago"
          >
            <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <tr>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Monto
                </th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Fecha desembolso
                </th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Tx Hash
                </th>
                <th scope="col" className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {creditosPendientes.map((credito) => {
                const isFormOpen = currentCreditoId === credito.id;
                const montoCop = (() => {
                  try {
                    return cusdToCop(Number(credito.monto));
                  } catch {
                    return 0;
                  }
                })();

                return (
                  <tr key={credito.id} className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-950 dark:text-white font-bold">
                      $ {montoCop.toLocaleString('es-CO')} COP
                    </td>
                    <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-medium">
                      {new Date(credito.fecha_actualizacion).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                      {credito.tx_hash ? (
                        <CeloScanLink txHash={credito.tx_hash} />
                      ) : (
                        <span className="text-slate-400 dark:text-gray-500 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                      {!isFormOpen ? (
                        <button
                          onClick={() => openForm(credito.id)}
                          disabled={isSubmitting}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                          aria-label={`Registrar pago para crédito de $${montoCop} COP`}
                        >
                          Registrar Pago
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={txHashInput}
                              onChange={(e) => handleTxHashChange(e.target.value)}
                              placeholder="0x..."
                              disabled={isSubmitting}
                              className={`block w-64 px-2.5 py-1.5 text-xs border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed ${
                                txHashError
                                  ? 'border-red-300 dark:border-red-600 text-red-900 dark:text-red-200 placeholder-red-300 dark:placeholder-red-400'
                                  : 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700'
                              }`}
                              aria-label="Hash de la transacción de pago"
                              aria-invalid={!!txHashError}
                              aria-describedby={txHashError ? 'tx-hash-error' : undefined}
                            />
                            <button
                              onClick={() => handleSubmit(credito.id)}
                              disabled={isSubmitting || !txHashInput.trim()}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                            >
                              {isSubmitting ? (
                                <>
                                  <svg
                                    className="animate-spin h-3.5 w-3.5 mr-1"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                  >
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  Confirmando…
                                </>
                              ) : (
                                'Confirmar Pago'
                              )}
                            </button>
                            <button
                              onClick={closeForm}
                              disabled={isSubmitting}
                              className="inline-flex items-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 transition-all duration-150 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                          {txHashError && (
                            <p id="tx-hash-error" className="text-xs text-red-600 dark:text-red-400" role="alert">
                              {txHashError}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
