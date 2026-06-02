'use client';

// =============================================================================
// Dashboard Error Boundary
// =============================================================================
//
// Catches errors specifically within the (dashboard) route group. More
// specific than the root error.tsx, so dashboard errors won't bubble up.
//
// Shows a contextual message with navigation back to the dashboard.
// =============================================================================

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      {/* Error icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-8 w-8 text-red-600 dark:text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Error en el panel
      </h1>

      <p className="mb-8 max-w-md text-gray-600 dark:text-gray-400">
        Ocurrió un error al cargar esta sección. Puedes intentar de nuevo o
        volver al panel principal.
      </p>

      {process.env.NODE_ENV === 'development' && (
        <p className="mb-6 max-w-lg rounded-md bg-gray-100 p-3 font-mono text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {error.message}
          {error.digest && (
            <span className="mt-1 block text-xs text-gray-500">
              Error ID: {error.digest}
            </span>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={reset}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          Intentar de nuevo
        </button>

        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
        >
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
