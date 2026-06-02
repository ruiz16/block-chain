// =============================================================================
// HealthIndicator — Colored Dot + Label for Entity Health
// =============================================================================

export type Health = 'al-dia' | 'mixto' | 'vencido';

interface HealthIndicatorProps {
  health: Health;
}

export default function HealthIndicator({ health }: HealthIndicatorProps) {
  switch (health) {
    case 'al-dia':
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400" title="Al día">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-sm shadow-emerald-300/50" />
          <span className="text-xs font-semibold">Al día</span>
        </span>
      );
    case 'mixto':
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400" title="En curso">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 shadow-sm shadow-amber-300/50" />
          <span className="text-xs font-semibold">En curso</span>
        </span>
      );
    case 'vencido':
      return (
        <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400" title="Vencido">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 dark:bg-red-400 shadow-sm shadow-red-300/50 animate-pulse" />
          <span className="text-xs font-semibold">Vencido</span>
        </span>
      );
  }
}
