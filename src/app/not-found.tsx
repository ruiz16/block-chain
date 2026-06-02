// =============================================================================
// Global Not Found — 404
// =============================================================================
//
// Renders when the URL does not match any route, or when notFound() is called
// from a Server Component.
//
// This is a Server Component (no 'use client' needed).
// =============================================================================

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      {/* 404 graphic */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <svg
          className="h-8 w-8 text-amber-600 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 11.625l2.25-2.25M12 11.625l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
          />
        </svg>
      </div>

      {/* Error code */}
      <p className="mb-2 font-mono text-5xl font-bold text-gray-300 dark:text-gray-600">
        404
      </p>

      {/* Title */}
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Página no encontrada
      </h1>

      <p className="mb-8 max-w-md text-gray-600 dark:text-gray-400">
        La página que estás buscando no existe o fue movida a otra dirección.
      </p>

      {/* Actions */}
      <Link
        href="/"
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
