'use client';

// =============================================================================
// CrearGaccForm — Formulario para crear un nuevo GACC
// =============================================================================
//
// States:
//   idle       — Form visible with nombre + descripcion fields
//   submitting — Button disabled with spinner
//   success    — Shows the generated code, calls onSuccess callback
//   error      — Error message with retry button
//
// Props:
//   onSuccess — Callback invoked after successful creation with the
//               created grupo data so the parent can refresh the view.
// =============================================================================

import { useState, useCallback, type FormEvent } from 'react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface CrearGaccFormProps {
  onSuccess?: (data: { id: string; nombre: string; codigo: string }) => void;
}

export default function CrearGaccForm({ onSuccess }: CrearGaccFormProps) {
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setState('submitting');
      setErrorMsg(null);

      try {
        const response = await fetch('/api/gacc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre.trim(),
            descripcion: descripcion.trim() || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail ?? data.error ?? 'Error al crear el GACC');
        }

        // Success
        setCodigoGenerado(data.grupo.codigo);
        setState('success');
        onSuccess?.(data.grupo);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
        setState('error');
      }
    },
    [nombre, descripcion, onSuccess],
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
            <p className="text-red-800 dark:text-red-200 font-medium">Error al crear el GACC</p>
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
  // Render: success state (show the generated code)
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
              GACC creado exitosamente
            </p>
            <p className="text-emerald-600 dark:text-emerald-300 text-sm mt-2">
              Comparte este código con otros participantes para que se unan a tu GACC:
            </p>
            <div className="mt-3 inline-block bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700">
              <span className="text-2xl font-bold tracking-widest text-gray-900 dark:text-white font-mono">
                {codigoGenerado}
              </span>
            </div>
            <p className="text-emerald-600 dark:text-emerald-300 text-xs mt-2">
              Los participantes que se unan quedarán pendientes de validación hasta que los aceptes.
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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Nombre */}
      <div>
        <label
          htmlFor="gacc-nombre"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Nombre del grupo
        </label>
        <input
          id="gacc-nombre"
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          disabled={isSubmitting}
          minLength={3}
          maxLength={200}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Ej: Ahorro Solidario"
        />
      </div>

      {/* Descripción */}
      <div>
        <label
          htmlFor="gacc-descripcion"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Descripción <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
        </label>
        <textarea
          id="gacc-descripcion"
          rows={3}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          disabled={isSubmitting}
          className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Propósito del grupo de ahorro"
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
            Creando GACC…
          </>
        ) : (
          'Crear GACC'
        )}
      </button>
    </form>
  );
}
