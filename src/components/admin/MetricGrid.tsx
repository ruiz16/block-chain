// =============================================================================
// MetricGrid — Responsive Grid of KPI Cards
// =============================================================================
//
// Arranges 1–4 MetricCard components in a responsive grid:
//   1 column on mobile, 2 on sm, 4 on lg+.
//
// Handles fewer than 4 items gracefully by left-aligning within the grid.
// =============================================================================

import MetricCard from './MetricCard';
import type { MetricCardProps } from './MetricCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MetricGridProps {
  /** Array of metric card configurations (1–4 items) */
  metrics: Array<Omit<MetricCardProps, 'icon'> & { icon?: MetricCardProps['icon'] }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MetricGrid({ metrics }: MetricGridProps) {
  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          icon={metric.icon}
          trend={metric.trend}
        />
      ))}
    </div>
  );
}
