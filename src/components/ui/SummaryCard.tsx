// =============================================================================
// SummaryCard — Colored KPI Card with Icon, Count, and Total
// =============================================================================

import type { ReactNode } from 'react';

export type SummaryVariant = 'warning' | 'success' | 'danger' | 'info' | 'default';

interface SummaryCardProps {
  label: string;
  count: number;
  total?: string;
  icon?: ReactNode;
  variant?: SummaryVariant;
}

const VARIANT_STYLES: Record<SummaryVariant, { text: string }> = {
  warning: {
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  success: {
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  danger: {
    text: 'text-red-600 dark:text-red-400',
  },
  info: {
    text: 'text-blue-600 dark:text-blue-400',
  },
  default: {
    text: 'text-slate-600 dark:text-slate-400',
  },
};

export default function SummaryCard({ label, count, total, icon, variant = 'default' }: SummaryCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-slate-200/80 dark:border-slate-700 p-5 shadow-sm flex items-center gap-4">
      {icon && (
        <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${styles.text} bg-gray-50 dark:bg-gray-800/60`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{count}</p>
        {total !== undefined && (
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 tabular-nums">{total}</p>
        )}
      </div>
    </div>
  );
}
