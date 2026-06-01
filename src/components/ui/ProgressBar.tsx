// =============================================================================
// ProgressBar — Lightweight Progress Indicator
// =============================================================================

interface ProgressBarProps {
  current: number;
  total: number;
  showLabel?: boolean;
}

export default function ProgressBar({ current, total, showLabel = true }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const color =
    pct === 100
      ? 'bg-emerald-500'
      : pct > 50
        ? 'bg-blue-500'
        : 'bg-amber-500';

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
          {current}/{total}
        </span>
      )}
    </div>
  );
}
