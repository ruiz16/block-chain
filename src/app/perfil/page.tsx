'use client';

// =============================================================================
// Perfil Page — View and edit your profile, connect your Celo wallet
// =============================================================================
//
// States:
//   loading     — Fetching profile data from GET /api/participantes/me
//   loaded      — Profile data ready, form editable
//   saving      — PATCH in progress
//   error       — API error, shown inline
//   success     — Changes saved successfully (brief toast-like message)
//
// Auth guard:
//   - If not authenticated → redirect to /login
//   - If no participante row → redirect to /onboarding
//
// Wallet section:
//   Uses WalletConnectButton to connect/disconnect MetaMask (or any EIP-1193
//   provider). The wallet address is set locally then saved via PATCH.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import WalletConnectButton from '@/components/auth/WalletConnectButton';
import { scoreEfectivo } from '@/lib/score/calculator';
import RedCard from '@/components/redes/RedCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipanteProfile {
  id: string;
  nombre: string;
  wallet_address: string;
  rol: string;
  activo: boolean;
  score_reputacion: number;
  created_at: string;
}

interface HistorialEvent {
  tipo_evento: string;
  delta: number;
  score_anterior: number;
  score_nuevo: number;
  created_at: string;
}

type PageState = 'loading' | 'loaded' | 'saving' | 'error' | 'success';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PerfilPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [state, setState] = useState<PageState>('loading');
  const [profile, setProfile] = useState<ParticipanteProfile | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [showHistorial, setShowHistorial] = useState(false);
  const [historial, setHistorial] = useState<HistorialEvent[] | null>(null);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);

  // ------------------------------------------------------------------------
  // Auth guard: redirect if not authenticated
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // ------------------------------------------------------------------------
  // Fetch profile on mount
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;

    setState('loading');
    setErrorMsg(null);

    fetch('/api/participantes/me')
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            // No participante row → redirect to onboarding
            router.push('/onboarding');
            return;
          }
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail ?? 'Error al cargar perfil');
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.participante) {
          setProfile(data.participante as ParticipanteProfile);
          setWalletAddress(data.participante.wallet_address ?? '');
          setState('loaded');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Error de conexión');
          setState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, router]);

  // ------------------------------------------------------------------------
  // Handle wallet address change from WalletConnectButton
  // ------------------------------------------------------------------------
  const handleWalletChange = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  // ------------------------------------------------------------------------
  // Handle manual address entry
  // ------------------------------------------------------------------------
  const handleManualAddressConfirm = useCallback(() => {
    const trimmed = manualAddress.trim();

    // Basic validation: must be a valid 0x address
    if (trimmed && !/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setErrorMsg('La dirección debe ser un hex válido de 40 caracteres con prefijo 0x');
      setState('error');
      return;
    }

    setWalletAddress(trimmed);
    setShowManualInput(false);
    setManualAddress('');
    setErrorMsg(null);
  }, [manualAddress]);

  // ------------------------------------------------------------------------
  // Clear wallet address
  // ------------------------------------------------------------------------
  const handleClearWallet = useCallback(() => {
    setWalletAddress('');
    // If there's a change to save, the user needs to click Guardar
  }, []);

  // ------------------------------------------------------------------------
  // Toggle historial (lazy load on expand)
  // ------------------------------------------------------------------------
  const handleToggleHistorial = useCallback(async () => {
    if (showHistorial) {
      setShowHistorial(false);
      return;
    }

    setShowHistorial(true);

    if (historial) return;

    setLoadingHistorial(true);
    setHistorialError(null);
    try {
      const res = await fetch('/api/participantes/score/historial?limit=10');
      if (!res.ok) throw new Error('Error al cargar historial');
      const data = await res.json();
      setHistorial(data.historial?.eventos ?? []);
    } catch (err) {
      console.error('Error al cargar historial:', err);
      setHistorialError('No se pudo cargar el historial');
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }
  }, [showHistorial, historial]);

  // ------------------------------------------------------------------------
  // Save profile
  // ------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setState('saving');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/participantes/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail ?? 'Error al guardar');
      }

      const data = await res.json();
      setProfile(data.participante as ParticipanteProfile);
      setState('success');

      // Reset success state after 3 seconds
      setTimeout(() => {
        setState('loaded');
      }, 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error de conexión');
      setState('error');
    }
  }, [walletAddress]);

  // ------------------------------------------------------------------------
  // Guard: loading auth
  // ------------------------------------------------------------------------
  if (authLoading || (!profile && state === 'loading')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" aria-busy="true" role="status">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="sr-only">Cargando perfil…</span>
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Guard: not authenticated (will redirect via useEffect)
  // ------------------------------------------------------------------------
  if (!isAuthenticated) {
    return null;
  }

  // ------------------------------------------------------------------------
  // Guard: error fetching profile (no redirect possible)
  // ------------------------------------------------------------------------
  if (state === 'error' && !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline"
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Profile loaded — render form
  // ------------------------------------------------------------------------
  const rolLabel = profile?.rol === 'prestatario' ? 'Prestatario'
    : profile?.rol === 'admin' ? 'Administrador'
    : profile?.rol ?? '—';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi Perfil</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Administrá tus datos y conectá tu wallet de Celo
        </p>
      </div>

      {/* Success toast */}
      {state === 'success' && (
        <div className="mb-6 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
          <p className="text-sm text-green-700 dark:text-green-200 font-medium">
            Perfil actualizado correctamente
          </p>
        </div>
      )}

      {/* Error toast */}
      {state === 'error' && errorMsg && (
        <div className="mb-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-700 dark:text-red-200">{errorMsg}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* ── Profile info card ── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Información Personal</h2>
          </div>
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</dt>
              <dd className="text-sm text-gray-900 dark:text-white col-span-2">{profile?.nombre ?? '—'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="text-sm text-gray-900 dark:text-white col-span-2">{user?.email ?? '—'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Rol</dt>
              <dd className="text-sm text-gray-900 dark:text-white col-span-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                  {rolLabel}
                </span>
              </dd>
            </div>
            {profile && (
              <>
                <div className="px-6 py-4 grid grid-cols-3 gap-4">
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Score de Reputación</dt>
                  <dd className="text-sm text-gray-900 dark:text-white col-span-2">
                    <span className="font-semibold">{scoreEfectivo(profile.score_reputacion, profile.created_at)}/100</span>
                    <button
                      type="button"
                      onClick={handleToggleHistorial}
                      className="ml-3 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
                    >
                      {showHistorial ? 'Ocultar historial' : 'Ver historial'}
                    </button>
                  </dd>
                </div>

                {showHistorial && (
                  <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Historial de cambios</h3>

                    {loadingHistorial ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Cargando historial…</p>
                    ) : historialError ? (
                      <p className="text-sm text-red-500 dark:text-red-400">{historialError}</p>
                    ) : historial && historial.length > 0 ? (
                      <ul className="space-y-2">
                        {historial.map((event, idx) => (
                          <li key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-center justify-between">
                            <span>
                              <span className={
                                event.delta > 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }>
                                {event.delta > 0 ? `+${event.delta}` : event.delta}
                              </span>
                              {' '}
                              <span className="capitalize">{event.tipo_evento.replace(/_/g, ' ')}</span>
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {event.score_anterior} → {event.score_nuevo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Sin eventos registrados</p>
                    )}
                  </div>
                )}
              </>
            )}
          </dl>
        </div>

        {/* ── Red de Apoyo ── */}
        <RedCard />

        {/* ── Wallet card ── */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Wallet Celo</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Conectá tu wallet para recibir desembolsos y realizar pagos
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Address display */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Dirección de wallet</p>
              {walletAddress ? (
                <p className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 rounded-md px-3 py-2 border border-gray-200 dark:border-gray-600 break-all">
                  {walletAddress}
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">Ninguna wallet conectada</p>
              )}
            </div>

            {/* Action buttons row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* MetaMask button */}
              <WalletConnectButton
                onAddressChange={handleWalletChange}
                savedAddress={walletAddress}
              />

              {/* Eliminar — solo si hay dirección */}
              {walletAddress && (
                <button
                  type="button"
                  onClick={handleClearWallet}
                  className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-700 rounded-md text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                  title="Eliminar la dirección de wallet guardada"
                >
                  <svg className="h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                  Eliminar
                </button>
              )}

              {/* Ingresar manualmente — link */}
              <button
                type="button"
                onClick={() => { setShowManualInput(!showManualInput); setManualAddress(''); }}
                className="inline-flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline focus:outline-none transition-colors"
              >
                {showManualInput ? 'Cancelar' : 'Ingresar dirección manualmente'}
                <svg
                  className={`h-3.5 w-3.5 ml-1 transition-transform ${showManualInput ? 'rotate-180' : ''}`}
                  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Manual input — collapsible */}
            {showManualInput && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="0x..."
                  className="block w-full max-w-md rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Dirección de wallet manual"
                />
                <button
                  type="button"
                  onClick={handleManualAddressConfirm}
                  disabled={!manualAddress.trim()}
                  className="inline-flex items-center px-3 py-2 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Save button ── */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={state === 'saving'}
            className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state === 'saving' ? (
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
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
