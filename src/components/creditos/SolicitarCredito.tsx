'use client';

// =============================================================================
// SolicitarCredito — Credit Request Form
// =============================================================================
//
// A client component with 4 explicit states:
//
//   idle       — Form with monto, descripcion, plazo_dias fields
//   submitting — Form disabled with spinner on the submit button
//   success    — Confirmation message with link to /mis-creditos
//   error      — Error message with retry button
// =============================================================================

import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

const PLAZO_OPTIONS = [
  { value: 30, label: '30 días' },
  { value: 60, label: '60 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '180 días' },
  { value: 365, label: '365 días' },
] as const;

export default function SolicitarCredito() {
  const router = useRouter();
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [plazoDias, setPlazoDias] = useState(30);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setState('submitting');
      setErrorMsg(null);

      try {
        const response = await fetch('/api/creditos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monto: Number(monto),
            descripcion: descripcion.trim() || undefined,
            plazo_dias: plazoDias,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al solicitar el crédito');
        }

        // Success — redirect to mis-creditos
        setState('success');
        router.push('/mis-creditos');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
        setState('error');
      }
    },
    [monto, descripcion, plazoDias, router],
  );

  const handleRetry = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
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
            <p className="text-red-800 dark:text-red-200 font-medium">Error al solicitar el crédito</p>
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
      <div className="rounded-md bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-4" role="alert">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-green-500 mt-0.5 mr-3 shrink-0"
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
            <p className="text-green-800 dark:text-green-200 font-medium">Solicitud de crédito exitosa</p>
            <p className="text-green-600 dark:text-green-300 text-sm mt-1">
              Serás redirigido a la página de Mis Créditos para dar seguimiento.
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
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Monto */}
      <div>
        <label
          htmlFor="monto"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Monto solicitado (COP)
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400 text-sm font-medium pointer-events-none">
            $
          </span>
          <input
            id="monto"
            type="number"
            step="1"
            min="1"
            required
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={isSubmitting}
            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-7 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="1.000.000"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Valor en pesos colombianos
        </p>
      </div>

      {/* Plazo */}
      <div>
        <label
          htmlFor="plazo_dias"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Plazo de pago
        </label>
        <select
          id="plazo_dias"
          value={plazoDias}
          onChange={(e) => setPlazoDias(Number(e.target.value))}
          disabled={isSubmitting}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {PLAZO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Descripción */}
      <div>
        <label
          htmlFor="descripcion"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Descripción <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
        </label>
        <textarea
          id="descripcion"
          rows={3}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          disabled={isSubmitting}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Breve descripción del propósito del crédito"
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {descripcion.length}/500 caracteres
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
            Enviando solicitud…
          </>
        ) : (
          'Solicitar crédito'
        )}
      </button>
    </form>
  );
}
