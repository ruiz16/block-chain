// =============================================================================
// AuditLogTable — Admin Audit Log Table
// =============================================================================
//
// Renders audit log entries in a styled table with columns for date, action,
// participant, entity, and details. Empty state shown when no entries.
// =============================================================================

import type { AuditLogAdmin } from '@/app/api/admin/audit-log/route';

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

/** Truncates a UUID for compact display */
function truncateId(id: string, maxLength = 10): string {
  return id.length > maxLength ? `${id.slice(0, maxLength)}…` : id;
}

/** Formats the entity column: tipo + truncated ID */
function formatEntity(tipo: string, id: string): string {
  return `${tipo}: ${truncateId(id)}`;
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
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-700 dark:text-gray-200 font-semibold">
                    {entry.participante_nombre ?? '—'}
                  </td>
                  <td className="px-6 py-4.5 whitespace-nowrap text-sm text-slate-500 dark:text-gray-400 font-mono">
                    <span className="bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs">
                      {formatEntity(entry.entidad_tipo, entry.entidad_id)}
                    </span>
                  </td>
                  <td className="px-6 py-4.5 text-sm text-slate-600 dark:text-gray-300 max-w-xs truncate font-mono text-xs">
                    {JSON.stringify(entry.detalles)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

