// =============================================================================
// PageHeader — Consistent Page Title + Subtitle
// =============================================================================

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}
