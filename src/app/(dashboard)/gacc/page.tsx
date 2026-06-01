'use client';

// =============================================================================
// GACC Page — Grupo de Ahorro y Crédito Comunitario
// =============================================================================
//
// Route: /gacc
//
// States:
//   loading    — Fetching data from GET /api/gacc/mi-grupo
//   no-gacc    — User has no GACC → show crear/unirse options
//   has-gacc   — User belongs to a GACC → show group info + miembros
//   error      — Error message
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import CrearGaccForm from '@/components/gacc/CrearGaccForm';
import UnirseGaccForm from '@/components/gacc/UnirseGaccForm';
import MiembroList from '@/components/gacc/MiembroList';
import ValidationBadge from '@/components/gacc/ValidationBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = 'loading' | 'no-gacc' | 'has-gacc' | 'error';

type GaccViewTab = 'crear' | 'unirse';

interface MiembroData {
  id: string;
  grupo_id: string;
  participante_id: string;
  validado_por: string | null;
  validado_en: string | null;
  activo: boolean;
  created_at: string;
  participante: {
    nombre: string;
    wallet_address: string;
    score_reputacion: number;
  } | null;
  validador: {
    nombre: string;
  } | null;
}

interface GrupoData {
  id: string;
  nombre: string;
  descripcion: string | null;
  codigo: string;
  creador_id: string;
  activo: boolean;
  created_at: string;
}

interface MiembroSelf {
  id: string;
  nombre: string;
  validado: boolean;
}

// =============================================================================
// Page Component
// =============================================================================

export default function GaccPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<GaccViewTab>('crear');

  // GACC data
  const [grupo, setGrupo] = useState<GrupoData | null>(null);
  const [miembroSelf, setMiembroSelf] = useState<MiembroSelf | null>(null);
  const [miembros, setMiembros] = useState<MiembroData[]>([]);

  // ------------------------------------------------------------------
  // Fetch GACC data on mount
  // ------------------------------------------------------------------
  const fetchMiGrupo = useCallback(async () => {
    try {
      setPageState('loading');
      setErrorMsg(null);

      const res = await fetch('/api/gacc/mi-grupo');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? 'Error al cargar tu GACC');
      }

      const data = await res.json();

      if (!data.grupo) {
        // No GACC yet
        setGrupo(null);
        setMiembroSelf(null);
        setMiembros([]);
        setPageState('no-gacc');
        return;
      }

      setGrupo(data.grupo);
      setMiembroSelf(data.miembro);
      setMiembros(data.miembros ?? []);
      setPageState('has-gacc');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setPageState('error');
    }
  }, []);

  useEffect(() => {
    fetchMiGrupo();
  }, [fetchMiGrupo]);

  // ------------------------------------------------------------------
  // Handlers for child component callbacks
  // ------------------------------------------------------------------
  const handleCrearSuccess = useCallback(() => {
    // After creating GACC, refresh to show the group view
    fetchMiGrupo();
  }, [fetchMiGrupo]);

  const handleUnirseSuccess = useCallback(() => {
    // After joining, refresh to show the group view
    fetchMiGrupo();
  }, [fetchMiGrupo]);

  const handleMiembroValidado = useCallback(() => {
    // After validating a member, refresh to show updated statuses
    fetchMiGrupo();
  }, [fetchMiGrupo]);

  // ==========================================================================
  // Render: loading state
  // ==========================================================================
  if (pageState === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div
          className="flex items-center justify-center p-12"
          aria-busy="true"
          role="status"
        >
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mr-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-gray-600 dark:text-gray-300">Cargando tu GACC…</span>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: error state
  // ==========================================================================
  if (pageState === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
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
              <p className="text-red-800 dark:text-red-200 font-medium">Error al cargar tu GACC</p>
              {errorMsg && <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>}
            </div>
          </div>
          <button
            onClick={fetchMiGrupo}
            className="mt-3 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: no-gacc state
  // ==========================================================================
  if (pageState === 'no-gacc') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Grupo de Ahorro y Crédito Comunitario
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Crea o únete a un GACC para empezar a solicitar créditos
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
          <button
            onClick={() => setTab('crear')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'crear'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Crear GACC
          </button>
          <button
            onClick={() => setTab('unirse')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'unirse'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Unirse por código
          </button>
        </div>

        {/* Tab content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          {tab === 'crear' ? (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Crear un nuevo GACC
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Al crear un GACC, automáticamente serás el creador y quedarás validado.
                Luego podrás compartir el código con otros participantes para que se unan.
              </p>
              <CrearGaccForm onSuccess={handleCrearSuccess} />
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Unirse a un GACC existente
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Ingresa el código que te compartió el creador del GACC.
                Una vez que te unas, un miembro validado del grupo deberá aceptar tu membresía
                antes de que puedas solicitar créditos.
              </p>
              <UnirseGaccForm onSuccess={handleUnirseSuccess} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: has-gacc state
  // ==========================================================================
  const isCreator = miembroSelf?.id === grupo?.creador_id;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {grupo?.nombre ?? 'Mi GACC'}
          </h1>
          {miembroSelf && (
            <ValidationBadge validado={miembroSelf.validado} />
          )}
          {isCreator && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700">
              Creador
            </span>
          )}
        </div>
        {grupo?.descripcion && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {grupo.descripcion}
          </p>
        )}
      </div>

      {/* Group code card */}
      {isCreator && grupo && (
        <div className="mb-8 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <svg
              className="w-5 h-5 text-blue-500 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
            </svg>
            <div className="flex-1">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Código para compartir
              </p>
              <p className="text-lg font-bold tracking-widest text-blue-900 dark:text-blue-100 font-mono">
                {grupo.codigo}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(grupo.codigo).catch(() => {});
              }}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 transition-colors"
            >
              Copiar código
            </button>
          </div>
        </div>
      )}

      {/* Info alert if not validated */}
      {miembroSelf && !miembroSelf.validado && (
        <div className="mb-8 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3" role="alert">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                Validación pendiente
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                Necesitas que un miembro validado del GACC te acepte para poder solicitar créditos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Members section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Miembros ({miembros.length})
        </h2>
        {grupo && miembroSelf && (
          <MiembroList
            grupoId={grupo.id}
            creadorId={grupo.creador_id}
            currentParticipanteId={miembroSelf.id}
            miembros={miembros}
            onMiembroValidado={handleMiembroValidado}
          />
        )}
      </div>
    </div>
  );
}
