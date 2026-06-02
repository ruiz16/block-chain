'use client';

// =============================================================================
// Aprobación Page — Panel de Aprobación de Créditos (Client-Side)
// =============================================================================
//
// Client component that fetches pending credits from /api/creditos/pendientes
// on mount and passes them to PanelAprobacion with lifted state for composition.
//
// Composition pattern:
//   Instead of a renderAvalManager render prop, this page manages the
//   expanded-aval state and credit estado map, passing them as props to
//   PanelAprobacion. GestorAvales is rendered directly below the panel,
//   colocated with the state that drives it.
//
// Route: /aprobacion
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, LoadingSkeleton, ErrorAlert } from '@/components/ui';
import PanelAprobacion from '@/components/creditos/PanelAprobacion';
import GestorAvales from '@/components/avales/GestorAvales';
import type { CreditoPendiente } from '@/types/database';

type PageState = 'loading' | 'error' | 'ready';

export default function AprobacionPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [creditos, setCreditos] = useState<CreditoPendiente[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedAval, setExpandedAval] = useState<string | null>(null);
  const [creditEstados, setCreditEstados] = useState<Record<string, string>>({});

  const handleCreditEstadoChange = useCallback(
    (creditoId: string, nuevoEstado: string) => {
      setCreditEstados((prev) => ({ ...prev, [creditoId]: nuevoEstado }));
    },
    [],
  );

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
          const creditosData = data.creditos ?? [];
          setCreditos(creditosData);

          // Initialize creditEstados from loaded data
          const estados: Record<string, string> = {};
          creditosData.forEach((c: CreditoPendiente) => {
            if (c.estado) estados[c.id] = c.estado;
          });
          setCreditEstados(estados);

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

  // Derive the expanded credit for GestorAvales
  const expandedCredito = expandedAval
    ? creditos.find((c) => c.id === expandedAval)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Panel de Aprobación"
        subtitle="Revisa y aprueba créditos pendientes para desembolsar fondos"
      />

      {state === 'loading' && <LoadingSkeleton variant="table" />}

      {state === 'error' && <ErrorAlert message={errorMsg!} onRetry={() => window.location.reload()} />}

      {state === 'ready' && (
        <>
          <PanelAprobacion
            creditosIniciales={creditos}
            creditEstados={creditEstados}
            onCreditEstadoChange={handleCreditEstadoChange}
            enableAvalManagement={true}
            expandedAvalId={expandedAval}
            onToggleAval={setExpandedAval}
          />

          {/* Expandable aval manager — rendered by the parent via composition */}
          {expandedCredito?.prestatarioId && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Gestión de avales — {expandedCredito.solicitante}
                </h3>
                <button
                  onClick={() => setExpandedAval(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  aria-label="Cerrar gestión de avales"
                >
                  <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <GestorAvales
                creditoId={expandedCredito.id}
                prestatarioId={expandedCredito.prestatarioId}
                onEstadoChange={(nuevoEstado) => {
                  handleCreditEstadoChange(expandedCredito.id, nuevoEstado);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
