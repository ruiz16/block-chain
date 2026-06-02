// =============================================================================
// LoadingSkeleton — Animated Skeleton Loaders
// =============================================================================

interface LoadingSkeletonProps {
  variant?: 'table' | 'cards' | 'text';
  rows?: number;
  count?: number;
}

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20 overflow-hidden animate-pulse">
      <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="h-3 bg-slate-700 rounded w-1/4" />
      </div>
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-md" />
    </div>
  );
}

export default function LoadingSkeleton({ variant = 'table', rows, count }: LoadingSkeletonProps) {
  switch (variant) {
    case 'table':
      return <TableSkeleton />;
    case 'cards':
      return <CardsSkeleton count={count ?? 3} />;
    case 'text':
      return <TextSkeleton />;
  }
}
