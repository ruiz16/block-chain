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
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <p className="mt-1 text-sm text-gray-500">
          Administrá tus datos y conectá tu wallet de Celo
        </p>
      </div>

      {/* Success toast */}
      {state === 'success' && (
        <div className="mb-6 rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-700 font-medium">
            Perfil actualizado correctamente
          </p>
        </div>
      )}

      {/* Error toast */}
      {state === 'error' && errorMsg && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* ── Profile info card ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Información Personal</h2>
          </div>
          <dl className="divide-y divide-gray-100">
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Nombre</dt>
              <dd className="text-sm text-gray-900 col-span-2">{profile?.nombre ?? '—'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900 col-span-2">{user?.email ?? '—'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Rol</dt>
              <dd className="text-sm text-gray-900 col-span-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {rolLabel}
                </span>
              </dd>
            </div>
            {profile && profile.score_reputacion > 0 && (
              <div className="px-6 py-4 grid grid-cols-3 gap-4">
                <dt className="text-sm font-medium text-gray-500">Score</dt>
                <dd className="text-sm text-gray-900 col-span-2">{profile.score_reputacion}/100</dd>
              </div>
            )}
          </dl>
        </div>

        {/* ── Wallet card ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Wallet Celo</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Conectá tu wallet para recibir desembolsos y realizar pagos
            </p>
          </div>
          <div className="px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Dirección de wallet</p>
                {walletAddress ? (
                  <p className="text-sm font-mono text-gray-900 bg-gray-50 rounded-md px-3 py-2 border border-gray-200 break-all">
                    {walletAddress}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">Ninguna wallet conectada</p>
                )}
              </div>
              <div className="shrink-0">
                <WalletConnectButton onAddressChange={handleWalletChange} />
              </div>
            </div>
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
