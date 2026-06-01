// =============================================================================
// SummaryGrid — Responsive Grid Wrapper for SummaryCards
// =============================================================================

import type { ReactNode } from 'react';

interface SummaryGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

const GRID_COLS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export default function SummaryGrid({ children, columns = 3 }: SummaryGridProps) {
  return (
    <div className={`grid grid-cols-1 ${GRID_COLS[columns]} gap-4 mb-8`}>
      {children}
    </div>
  );
}
