'use client';

// =============================================================================
// Admin Dashboard Page — KPI Cards + Audit Log + Quick Links
// =============================================================================
//
// Client component that fetches metrics and audit log on mount via the
// admin API boundary. Renders MetricGrid and AuditLogTable with per-section
// error handling (no blanket crash on API failure).
//
// Route: /admin/dashboard
//
// States:
//   loading    — Skeleton/spinner while fetching both APIs
//   loaded     — Normal display with KPIs + audit table + quick links
//   error      — Section-level error messages if one API fails
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import MetricGrid from '@/components/admin/MetricGrid';
import AuditLogTable from '@/components/admin/AuditLogTable';
import type { AuditLogAdmin } from '@/app/api/admin/audit-log/route';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MetricsResponse {
  totalParticipantes: number;
  totalCreditos: number;
  totalDesembolsado: string;
  totalPagado: string;
  enCirculacion: string;
  defaultRate: number;
  scorePromedio: number;
}

interface AuditLogResponse {
  data: AuditLogAdmin[];
  total: number;
  page: number;
  limit: number;
}

type LoadingState = 'loading' | 'loaded' | 'error';

interface SectionError {
  metrics: string | null;
  audit: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminDashboardPage() {
  const [state, setState] = useState<LoadingState>('loading');
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditLogAdmin[]>([]);
  const [sectionErrors, setSectionErrors] = useState<SectionError>({
    metrics: null,
    audit: null,
  });

  const fetchData = useCallback(async () => {
    // Fetch metrics and audit log in parallel — per-section error handling
    const [metricsResult, auditResult] = await Promise.allSettled([
      fetch('/api/admin/metrics').then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { detail?: string }).detail ?? 'Error al cargar métricas');
        }
        return res.json() as Promise<MetricsResponse>;
      }),
      fetch('/api/admin/audit-log?limit=20').then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { detail?: string }).detail ?? 'Error al cargar auditoría');
        }
        return res.json() as Promise<AuditLogResponse>;
      }),
    ]);

    const newErrors: SectionError = { metrics: null, audit: null };

    if (metricsResult.status === 'fulfilled') {
      setMetrics(metricsResult.value);
    } else {
      newErrors.metrics = metricsResult.reason instanceof Error
        ? metricsResult.reason.message
        : 'Error al cargar métricas';
    }

    if (auditResult.status === 'fulfilled') {
      setAuditEntries(auditResult.value.data);
    } else {
      newErrors.audit = auditResult.reason instanceof Error
        ? auditResult.reason.message
        : 'Error al cargar auditoría';
    }

    setSectionErrors(newErrors);
    setState('loaded');
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ==========================================================================
  // Render: loading state
  // ==========================================================================
  if (state === 'loading') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cargando indicadores…</p>
        </div>

        {/* Skeleton grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 animate-pulse"
              aria-hidden="true"
            >
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            </div>
          ))}
        </div>

        {/* Skeleton table */}
        <div className="rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 animate-pulse" aria-hidden="true">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
          ))}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Prepare display KPIs from metrics data
  // ==========================================================================
  const displayMetrics = metrics
    ? [
        {
          label: 'Total Participantes',
          value: metrics.totalParticipantes,
          icon: (
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
        },
        {
          label: 'Desembolsado (COPm)',
          value: Number(metrics.totalDesembolsado).toLocaleString('es-CO'),
          icon: (
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
        {
          label: 'En Circulación (COPm)',
          value: Number(metrics.enCirculacion).toLocaleString('es-CO'),
          icon: (
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          ),
        },
        {
          label: 'Tasa de Default',
          value: `${metrics.defaultRate.toFixed(1)}%`,
          icon: (
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Indicadores generales y actividad de la plataforma
        </p>
      </div>

      {/* Metrics section */}
      <section className="mb-8" aria-label="Indicadores generales">
        <h2 className="sr-only">Métricas</h2>
        {sectionErrors.metrics ? (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 mb-4" role="alert">
            <p className="text-red-800 dark:text-red-200 font-medium text-sm">Error al cargar métricas</p>
            <p className="text-red-600 dark:text-red-300 text-xs mt-1">{sectionErrors.metrics}</p>
          </div>
        ) : metrics ? (
          <MetricGrid metrics={displayMetrics} />
        ) : null}
      </section>

      {/* Audit log section */}
      <section className="mb-8" aria-label="Últimos movimientos">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Últimos movimientos
        </h2>
        {sectionErrors.audit ? (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
            <p className="text-red-800 dark:text-red-200 font-medium text-sm">Error al cargar auditoría</p>
            <p className="text-red-600 dark:text-red-300 text-xs mt-1">{sectionErrors.audit}</p>
          </div>
        ) : (
          <AuditLogTable entries={auditEntries} />
        )}
      </section>

      {/* Quick links */}
      <nav aria-label="Accesos rápidos de administración">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Accesos rápidos
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/participantes"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Gestión de Participantes
          </Link>
          <Link
            href="/admin/creditos"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Gestión de Créditos
          </Link>
          <Link
            href="/admin/desembolsos"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Desembolsos
          </Link>
          <Link
            href="/admin/gacc"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            Gestión de GACCs
          </Link>
          <Link
            href="/admin/cuotas"
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
            Gestión de Cuotas
          </Link>
        </div>
      </nav>
    </div>
  );
}
