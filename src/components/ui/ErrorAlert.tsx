// =============================================================================
// ErrorAlert — Red Banner with Message + Retry
// =============================================================================

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p className="text-sm text-red-800 dark:text-red-300 flex-1">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors shrink-0"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
