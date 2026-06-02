// =============================================================================
// Dashboard Loading — Suspense fallback
// =============================================================================
//
// Shows a subtle skeleton while any (dashboard) page fetches data.
// The AppShell sidebar remains visible — only the content area shows
// the loading indicator.
//
// This is a Server Component (no 'use client' needed).
// =============================================================================

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20" role="status" aria-label="Cargando">
      {/* Spinner */}
      <div className="mb-6 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-400" />

      {/* Skeleton lines */}
      <div className="w-64 space-y-3">
        <div className="h-3 w-full animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>

      <span className="sr-only">Cargando contenido…</span>
    </div>
  );
}
