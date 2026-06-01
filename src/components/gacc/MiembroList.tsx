'use client';

// =============================================================================
// MiembroList — Lista de miembros del GACC con estado de validación
// =============================================================================
//
// Shows all members of the current user's GACC with their validation status.
// If the current user is the group creator, they can validate pending members.
//
// Props:
//   creadorId       — participante_id del creador del grupo
//   currentParticipanteId — participante_id del usuario actual
//   miembros        — Array de miembros con datos del participante
//   onMiembroValidado — Callback after a member is validated (to refresh parent)
// =============================================================================

import { useState, useCallback } from 'react';
import ValidationBadge from '@/components/gacc/ValidationBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MiembroData {
  id: string;
  grupo_id: string;
  participante_id: string;
  validado_por: string | null;
  validado_en: string | null;
  activo: boolean;
  created_at: string;
  participante: {
    nombre: string;
    wallet_address: string;
    score_reputacion: number;
  } | null;
  validador: {
    nombre: string;
  } | null;
}

interface MiembroListProps {
  grupoId: string;
  creadorId: string;
  currentParticipanteId: string;
  miembros: MiembroData[];
  onMiembroValidado?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ESTADO_PENDIENTE = 'pending' as const;
const ESTADO_VALIDADO = 'validado' as const;
const ESTADO_CREADOR = 'creador' as const;

type MiembroEstado = typeof ESTADO_PENDIENTE | typeof ESTADO_VALIDADO | typeof ESTADO_CREADOR;

function getEstado(miembro: MiembroData, creadorId: string): MiembroEstado {
  if (miembro.participante_id === creadorId) return ESTADO_CREADOR;
  if (miembro.validado_en) return ESTADO_VALIDADO;
  return ESTADO_PENDIENTE;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MiembroList({ grupoId, creadorId, currentParticipanteId, miembros, onMiembroValidado }: MiembroListProps) {
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isCreator = currentParticipanteId === creadorId;

  const handleValidar = useCallback(
    async (miembroId: string) => {
      setValidatingId(miembroId);
      setActionError(null);

      try {
        const response = await fetch(`/api/gacc/${grupoId}/validar/${miembroId}`, {
          method: 'POST',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al validar miembro');
        }

        // Success — notify parent to refresh
        onMiembroValidado?.();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Error inesperado');
      } finally {
        setValidatingId(null);
      }
    },
    [grupoId, onMiembroValidado],
  );

  // Sort: creator first, then validated, then pending
  const sorted = [...miembros].sort((a, b) => {
    const estadoA = getEstado(a, creadorId);
    const estadoB = getEstado(b, creadorId);

    const order = [ESTADO_CREADOR, ESTADO_VALIDADO, ESTADO_PENDIENTE];
    return order.indexOf(estadoA) - order.indexOf(estadoB);
  });

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div>
      {actionError && (
        <div
          className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-200"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((miembro) => {
          const estado = getEstado(miembro, creadorId);
          const isSelf = miembro.participante_id === currentParticipanteId;
          const nombre = miembro.participante?.nombre ?? 'Participante';
          const score = miembro.participante?.score_reputacion ?? 0;
          const wallet = miembro.participante?.wallet_address;
          const validadorNombre = miembro.validador?.nombre;

          return (
            <div
              key={miembro.id}
              className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              {/* Left: info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {nombre}
                    {isSelf && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-normal">
                        (tú)
                      </span>
                    )}
                  </span>

                  {/* Estado badge */}
                  {estado === ESTADO_CREADOR && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700">
                      Creador
                    </span>
                  )}
                  {estado === ESTADO_VALIDADO && <ValidationBadge validado={true} />}
                  {estado === ESTADO_PENDIENTE && <ValidationBadge validado={false} />}
                </div>

                <div className="flex items-center gap-3 mt-1">
                  {score > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Score: {score}
                    </span>
                  )}
                  {validadorNombre && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Validado por: {validadorNombre}
                    </span>
                  )}
                  {wallet && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-[120px]" title={wallet}>
                      {wallet.slice(0, 6)}...{wallet.slice(-4)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: action button (only for creator, not self, not already validated) */}
              {isCreator && estado === ESTADO_PENDIENTE && (
                <button
                  onClick={() => handleValidar(miembro.participante_id)}
                  disabled={validatingId === miembro.participante_id}
                  className="shrink-0 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {validatingId === miembro.participante_id ? (
                    <>
                      <svg
                        className="animate-spin h-3.5 w-3.5 mr-1.5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Validando…
                    </>
                  ) : (
                    'Validar'
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {miembros.length === 0 && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          No hay miembros en este GACC
        </div>
      )}
    </div>
  );
}
