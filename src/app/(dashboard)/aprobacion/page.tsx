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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageHeader
        title="Panel de Aprobación"
        subtitle="Revisa y aprueba créditos pendientes para desembolsar fondos"
      />

      {state === 'loading' && <LoadingSkeleton variant="table" />}

      {state === 'error' && <ErrorAlert message={errorMsg!} onRetry={() => window.location.reload()} />}

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
