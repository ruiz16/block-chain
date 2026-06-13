// =============================================================================
// MetricCard — Single KPI Display Card
// =============================================================================
//
// Pure display component. Renders an icon, label, value, and optional trend
// indicator in a styled card. No hooks — safe as a server component.
//
// Used within MetricGrid to compose the admin dashboard KPI section.
// =============================================================================

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MetricCardProps {
  /** Display label (e.g. "Total Participantes") */
  label: string;
  /** Formatted value (e.g. "42" or "12,500 COPm") */
  value: string | number;
  /** Optional icon element rendered top-left */
  icon?: ReactNode;
  /** Optional trend indicator */
  trend?: {
    direction: 'up' | 'down';
    value: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MetricCard({ label, value, icon, trend }: MetricCardProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-slate-200/80 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        {icon && (
          <div className="flex-shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true">
            {icon}
          </div>
        )}
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend.direction === 'up'
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {trend.direction === 'up' ? (
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {trend.value}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400 truncate" title={label}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
        {value}
      </p>
    </div>
  );
}
