// =============================================================================
// AuditLogTable — Admin Audit Log Table
// =============================================================================
//
// Renders audit log entries in a styled table with columns for date, action,
// participant, entity, and details. Empty state shown when no entries.
// =============================================================================

import { useState } from 'react';
import type { AuditLogAdmin } from '@/app/api/admin/audit-log/route';
import { getCeloScanUrl } from '@/config/celo';
import type { TxHash } from '@/types/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps internal action codes to human-readable Spanish labels */
function actionLabel(accion: string): string {
  const labels: Record<string, string> = {
    credito_creado: 'Crédito Creado',
    credito_aprobado: 'Crédito Aprobado',
    desembolso: 'Desembolso',
    desembolso_fallo: 'Desembolso Fallido',
    pago_recibido: 'Pago Recibido',
    default_registrado: 'Default',
    aval_agregado: 'Aval Agregado',
    aval_revocado: 'Aval Revocado',
  };

  return labels[accion] ?? accion;
}

/** Truncates a wallet address: 0x1234…5678 */
function truncateWallet(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Formats the entity column: tipo + truncated ID (same style as wallet) */
function formatEntity(tipo: string, id: string): string {
  const truncated = id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
  return `${tipo}: ${truncated}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AuditLogTableProps {
  /** Audit log entries to display */
  entries: AuditLogAdmin[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AuditLogTable({ entries }: AuditLogTableProps) {
  const [selectedEntry, setSelectedEntry] = useState<AuditLogAdmin | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-12 text-center shadow-lg shadow-slate-100/50 dark:shadow-black/20">
        <svg
          className="h-16 w-16 text-slate-300 dark:text-gray-600 mx-auto mb-4"
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-slate-800 dark:text-gray-200 mb-1">Sin movimientos</h3>
        <p className="text-slate-400 dark:text-gray-500 text-sm">
          No se encontraron entradas en el registro de auditoría.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Registro de auditoría">
          <thead className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
            <tr>
              <th
                scope="col"
                className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Fecha
              </th>
              <th
                scope="col"
                className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Acción
              </th>
              <th
                scope="col"
                className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Participante
              </th>
              <th
                scope="col"
                className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Entidad
              </th>
              <th
                scope="col"
                className="px-6 py-4.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Detalles
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {entries.map((entry) => {
              // Custom action badges
              const actionColors: Record<string, string> = {
                credito_creado: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700',
                credito_aprobado: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700',
                desembolso: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700',
                desembolso_fallo: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-700',
                pago_recibido: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-700',
                default_registrado: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-700',
                aval_agregado: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-700',
                aval_revocado: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700',
              };

              const badgeStyle = actionColors[entry.accion] ?? 'bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-gray-600';

              return (
                <tr key={entry.id} className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-medium">
                    {new Date(entry.fecha).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badgeStyle}`}>
                      {actionLabel(entry.accion)}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-700 dark:text-gray-200 font-mono">
                    {entry.participante_wallet
                      ? <span title={entry.participante_wallet}>{truncateWallet(entry.participante_wallet)}</span>
                      : <span className="font-sans text-slate-400 dark:text-gray-500">—</span>}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-mono">
                    <span
                      className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs"
                      title={`${entry.entidad_tipo}: ${entry.entidad_id}`}
                    >
                      {formatEntity(entry.entidad_tipo, entry.entidad_id)}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm">
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

      {/* ── Details Modal ── */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedEntry(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Detalles del evento"
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">Detalles del Evento</h3>
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    {new Date(selectedEntry.fecha).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
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
              {/* Action badge + entity */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700">
                  {(() => {
                    const labels: Record<string, string> = {
                      credito_creado: 'Crédito Creado',
                      credito_aprobado: 'Crédito Aprobado',
                      desembolso: 'Desembolso',
                      desembolso_fallo: 'Desembolso Fallido',
                      pago_recibido: 'Pago Recibido',
                      default_registrado: 'Default',
                      aval_agregado: 'Aval Agregado',
                      aval_revocado: 'Aval Revocado',
                    };
                    return labels[selectedEntry.accion] ?? selectedEntry.accion;
                  })()}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-600">
                  {selectedEntry.entidad_tipo}: {selectedEntry.entidad_id.slice(0, 6)}…{selectedEntry.entidad_id.slice(-4)}
                </span>
              </div>

              {/* Participant info */}
              {selectedEntry.participante_wallet && (
                <div className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-3.5">
                  <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Participante</p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-gray-200">
                        {selectedEntry.participante_nombre || '—'}
                      </p>
                      <p className="text-xs font-mono text-slate-400 dark:text-gray-500">
                        {truncateWallet(selectedEntry.participante_wallet)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Details raw JSON */}
              <div>
                <p className="text-xs font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2">Información del Evento</p>
                <pre className="bg-slate-50 dark:bg-gray-900/50 rounded-xl p-4 text-xs font-mono text-slate-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify(selectedEntry.detalles, null, 2)}
                </pre>
              </div>

              {/* CeloScan link — button style, only if tx_hash exists in detalles */}
              {(() => {
                const txHash = selectedEntry.detalles?.tx_hash ?? selectedEntry.detalles?.txHash ?? null;
                if (!txHash || typeof txHash !== 'string') return null;
                return (
                  <div className="flex justify-end pt-1">
                    <a
                      href={getCeloScanUrl(txHash as TxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200/60 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-800 dark:hover:text-blue-200 transition-colors duration-150 cursor-pointer"
                      aria-label="Ver transacción en CeloScan"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Ver en CeloScan
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

