// =============================================================================
// CardSection — Dark Gradient Header Card with Content Body
// =============================================================================

import type { ReactNode } from 'react';

interface CardSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  headerRight?: ReactNode;
  className?: string;
}

export default function CardSection({
  title,
  subtitle,
  children,
  headerRight,
  className = '',
}: CardSectionProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20 overflow-hidden mb-6 ${className}`}
    >
      <div className="px-6 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {headerRight && (
          <div className="flex-shrink-0">{headerRight}</div>
        )}
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
