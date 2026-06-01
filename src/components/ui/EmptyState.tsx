// =============================================================================
// EmptyState — Centered Icon + Title + Description
// =============================================================================

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-dashed border-slate-200/80 dark:border-slate-700 p-12 text-center shadow-xl shadow-slate-100/40 dark:shadow-black/20">
      {icon ? (
        <div className="text-slate-300 dark:text-gray-600 mx-auto mb-4 flex justify-center">
          {icon}
        </div>
      ) : (
        <svg className="h-16 w-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
      <h3 className="text-lg font-medium text-slate-800 dark:text-gray-200 mb-1">{title}</h3>
      <p className="text-slate-400 dark:text-gray-500 text-sm">{description}</p>
    </div>
  );
}
