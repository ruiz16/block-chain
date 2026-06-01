'use client';

// =============================================================================
// UnirseGaccForm — Formulario para unirse a un GACC mediante código
// =============================================================================
//
// States:
//   idle       — Input visible for the join code
//   submitting — Button disabled with spinner
//   success    — Shows confirmation, calls onSuccess callback
//   error      — Error message with retry button
//
// Props:
//   onSuccess — Callback invoked after successfully joining so the
//               parent can refresh the view.
// =============================================================================

import { useState, useCallback, type FormEvent } from 'react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface UnirseGaccFormProps {
  onSuccess?: () => void;
}

export default function UnirseGaccForm({ onSuccess }: UnirseGaccFormProps) {
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [successDetail, setSuccessDetail] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setState('submitting');
      setErrorMsg(null);

      try {
        const response = await fetch('/api/gacc/unirse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo: codigo.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al unirse al GACC');
        }

        // Success — pending validation or already a member
        setSuccessDetail(data.detail ?? 'Te has unido al GACC exitosamente');
        setState('success');
        onSuccess?.();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
        setState('error');
      }
    },
    [codigo, onSuccess],
  );

  const handleRetry = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
    setSuccessDetail(null);
  }, []);

  // ==========================================================================
  // Render: error state
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4" role="alert">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-red-500 mt-0.5 mr-3 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-200 font-medium">Error al unirse al GACC</p>
            {errorMsg && <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>}
          </div>
        </div>
        <button
          onClick={handleRetry}
          className="mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ==========================================================================
  // Render: success state
  // ==========================================================================
  if (state === 'success') {
    return (
      <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 p-4" role="alert">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-emerald-500 mt-0.5 mr-3 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <p className="text-emerald-800 dark:text-emerald-200 font-medium">
              Solicitud enviada
            </p>
            <p className="text-emerald-600 dark:text-emerald-300 text-sm mt-1">
              {successDetail}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: idle / submitting state
  // ==========================================================================
  const isSubmitting = state === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Código */}
      <div>
        <label
          htmlFor="gacc-codigo"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Código del GACC
        </label>
        <input
          id="gacc-codigo"
          type="text"
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          disabled={isSubmitting}
          maxLength={50}
          placeholder="MANGLE-XXXX"
          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 font-mono tracking-wider focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Ingresa el código que te compartió el creador del GACC
        </p>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin h-4 w-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Uniéndose…
          </>
        ) : (
          'Unirse al GACC'
        )}
      </button>
    </form>
  );
}
