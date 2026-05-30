'use client';

// =============================================================================
// Aprobación Page — Panel de Aprobación de Créditos (Client-Side)
// =============================================================================
//
// Client component that fetches pending credits from /api/creditos/pendientes
// on mount and passes them to the PanelAprobacion component.
//
// The API endpoint handles auth verification and role checking server-side,
// so no SSR is needed here.
//
// Route: /aprobacion
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PanelAprobacion from '@/components/creditos/PanelAprobacion';
import GestorAvales from '@/components/avales/GestorAvales';
import type { CreditoPendiente } from '@/types/database';

type PageState = 'loading' | 'error' | 'ready';

export default function AprobacionPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [creditos, setCreditos] = useState<CreditoPendiente[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCreditos() {
      try {
        const res = await fetch('/api/creditos/pendientes');

        if (res.status === 401 || res.status === 403) {
          if (!cancelled) router.replace('/login?redirect=/aprobacion');
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Error al cargar créditos');
        }

        const data = await res.json();

        if (!cancelled) {
          setCreditos(data.creditos ?? []);
          setState('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
          setState('error');
        }
      }
    }

    loadCreditos();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Aprobación</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Revisa y aprueba créditos pendientes para desembolsar fondos
        </p>
      </div>

      {state === 'loading' && (
        <div className="flex items-center justify-center py-16" role="status">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4" role="alert">
          <p className="text-red-800 dark:text-red-200 font-medium">Error al cargar créditos</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>
          <button
            onClick={() => { setState('loading'); setErrorMsg(null); window.location.reload(); }}
            className="mt-3 text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {state === 'ready' && (
        <PanelAprobacion
          creditosIniciales={creditos}
          renderAvalManager={(creditoId, prestatarioId, onEstadoChange) => (
            <GestorAvales
              creditoId={creditoId}
              prestatarioId={prestatarioId}
              onEstadoChange={onEstadoChange}
            />
          )}
        />
      )}
    </div>
  );
}
