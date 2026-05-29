'use client';

// =============================================================================
// GestorAvales — Guarantor Management Component
// =============================================================================
//
// A client component with 6 explicit states:
//
//   loading    — Skeleton spinner (initial data load)
//   empty      — "Sin avales asignados" message
//   list       — Table of avales with [Revocar] button per row
//   assigning  — Disabled state while POST /api/avales is in flight
//   revoking   — Spinner on revoke button while PATCH is in flight
//   error      — Red alert with error detail + [Reintentar] button
//
// Mirrors the PanelAprobacion state machine pattern.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { AvalConParticipante } from '@/types/database';

type GestorState = 'loading' | 'empty' | 'list' | 'assigning' | 'revoking' | 'error';

interface GestorAvalesProps {
  creditoId: string;
  prestatarioId: string;
  onEstadoChange?: (nuevoEstado: string) => void;
}

/**
 * Truncate a wallet address for display: "0x1234…abcd"
 */
function truncateWallet(wallet: string): string {
  if (!wallet || wallet.length < 10) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

/**
 * Format a numeric string as a locale-aware currency amount.
 */
function formatMonto(monto: string): string {
  const num = Number(monto);
  if (isNaN(num)) return monto;
  return `${num.toLocaleString('es-CO')} cUSD`;
}

export default function GestorAvales({ creditoId, prestatarioId, onEstadoChange }: GestorAvalesProps) {
  const [state, setState] = useState<GestorState>('loading');
  const [avales, setAvales] = useState<AvalConParticipante[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [avaladorIdInput, setAvaladorIdInput] = useState('');
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch avales on mount
  // ------------------------------------------------------------------
  const fetchAvales = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);

    try {
      const response = await fetch(`/api/avales?credito_id=${encodeURIComponent(creditoId)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? 'Error al cargar avales');
      }

      // The API returns an array of avales with avalador_nombre and avalador_wallet
      const mapped: AvalConParticipante[] = (data as AvalConParticipante[]).map((item) => ({
        id: item.id,
        aval_id: item.aval_id,
        prestatario_id: item.prestatario_id,
        credito_id: item.credito_id,
        monto_maximo: item.monto_maximo,
        fecha_creacion: item.fecha_creacion,
        activo: item.activo,
        avalador_nombre: item.avalador_nombre,
        avalador_wallet: item.avalador_wallet,
      }));

      setAvales(mapped);

      if (mapped.length === 0) {
        setState('empty');
      } else {
        setState('list');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setState('error');
    }
  }, [creditoId]);

  useEffect(() => {
    fetchAvales();
  }, [fetchAvales]);

  // ------------------------------------------------------------------
  // Handle assign aval
  // ------------------------------------------------------------------
  const handleAssign = useCallback(async () => {
    if (!avaladorIdInput.trim()) return;

    setState('assigning');
    setErrorMsg(null);

    try {
      const response = await fetch('/api/avales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credito_id: creditoId,
          avalador_id: avaladorIdInput.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? 'Error al asignar aval');
      }

      // Success — refresh the list
      setShowAssignForm(false);
      setAvaladorIdInput('');
      onEstadoChange?.('avalado');
      await fetchAvales();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setState('error');
    }
  }, [avaladorIdInput, creditoId, fetchAvales, onEstadoChange]);

  // ------------------------------------------------------------------
  // Handle revoke aval
  // ------------------------------------------------------------------
  const handleRevoke = useCallback(async (avalId: string) => {
    setRevokeConfirmId(null);
    setState('revoking');
    setErrorMsg(null);

    try {
      const response = await fetch(`/api/avales/${avalId}/revocar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? 'Error al revocar aval');
      }

      // Success — refresh the list; the API returns the new credit state
      if (data.credito_estado) {
        onEstadoChange?.(data.credito_estado);
      }

      await fetchAvales();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setState('error');
    }
  }, [fetchAvales, onEstadoChange]);

  // ------------------------------------------------------------------
  // Handle retry after error
  // ------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    setState(avales.length > 0 ? 'list' : 'empty');
  }, [avales.length]);

  // ==========================================================================
  // Render: loading state
  // ==========================================================================
  if (state === 'loading') {
    return (
      <div
        className="flex items-center justify-center p-4"
        aria-busy="true"
        role="status"
      >
        <svg
          className="animate-spin h-5 w-5 text-blue-600 mr-2"
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
        <span className="text-gray-500 text-sm">Cargando avales…</span>
      </div>
    );
  }

  // ==========================================================================
  // Render: error banner
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-red-50 border border-red-200 p-3" role="alert">
          <div className="flex items-start">
            <svg
              className="h-4 w-4 text-red-500 mt-0.5 mr-2 shrink-0"
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
              <p className="text-red-800 font-medium text-sm">Error en avales</p>
              {errorMsg && <p className="text-red-600 text-xs mt-1">{errorMsg}</p>}
            </div>
          </div>
        </div>

        <button
          onClick={handleRetry}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="Reintentar cargar avales"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ==========================================================================
  // Render: list state (with optional assign inline form)
  // ==========================================================================
  const isMutating = state === 'assigning' || state === 'revoking';

  return (
    <div className="space-y-3">
      {/* Assign form (collapsible) */}
      {showAssignForm ? (
        <div className="rounded-md bg-gray-50 border border-gray-200 p-3 space-y-2" role="form" aria-label="Formulario para agregar aval">
          <label htmlFor="avalador-id-input-list" className="block text-xs font-medium text-gray-700">
            ID del avalador
          </label>
          <input
            id="avalador-id-input-list"
            type="text"
            placeholder="UUID del avalador"
            value={avaladorIdInput}
            onChange={(e) => setAvaladorIdInput(e.target.value)}
            disabled={isMutating}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAssign}
              disabled={isMutating || !avaladorIdInput.trim()}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Confirmar asignación de aval"
            >
              {state === 'assigning' ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Asignando…
                </>
              ) : (
                'Asignar'
              )}
            </button>
            <button
              onClick={() => { setShowAssignForm(false); setAvaladorIdInput(''); }}
              disabled={isMutating}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              aria-label="Cancelar asignación"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowAssignForm(true); setErrorMsg(null); }}
          disabled={isMutating}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Agregar aval"
        >
          <svg
            className="h-4 w-4 mr-1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Agregar Aval
        </button>
      )}

      {/* Empty state */}
      {avales.filter((a) => a.activo).length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <svg
            className="h-10 w-10 text-gray-300 mb-3"
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          <p className="text-gray-500 text-sm">Sin avales asignados</p>
        </div>
      )}

      {/* Aval list */}
      <div className="space-y-3">
        {avales.filter((a) => a.activo).map((aval) => (
          <div
            key={aval.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition-all duration-150 hover:shadow-md hover:border-slate-300"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 truncate">
                  {aval.avalador_nombre}
                </span>
                <span className="text-slate-400 text-xs font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60" title={aval.avalador_wallet}>
                  {truncateWallet(aval.avalador_wallet)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{formatMonto(aval.monto_maximo)}</span>
                <span>•</span>
                <span>Asignado el {new Date(aval.fecha_creacion).toLocaleDateString('es-CO')}</span>
              </div>
            </div>

            {/* Revoke button or confirmation */}
            {revokeConfirmId === aval.id ? (
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-xs text-red-600 font-semibold">¿Confirmas?</span>
                <button
                  onClick={() => handleRevoke(aval.id)}
                  disabled={isMutating}
                  className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-all duration-150 cursor-pointer"
                  aria-label={`Confirmar revocación de aval de ${aval.avalador_nombre}`}
                >
                  {state === 'revoking' ? (
                    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    'Sí, revocar'
                  )}
                </button>
                <button
                  onClick={() => setRevokeConfirmId(null)}
                  disabled={isMutating}
                  className="inline-flex items-center px-2.5 py-1.5 border border-slate-200 text-xs font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all duration-150 cursor-pointer"
                  aria-label="Cancelar revocación"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRevokeConfirmId(aval.id)}
                disabled={isMutating}
                className="shrink-0 ml-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-semibold rounded-lg text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                aria-label={`Revocar aval de ${aval.avalador_nombre}`}
              >
                Revocar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
