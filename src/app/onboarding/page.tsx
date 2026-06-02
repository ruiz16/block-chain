'use client';

// =============================================================================
// Onboarding Page — Create Participant Profile
// =============================================================================
//
// Protected page: middleware already redirects unauthenticated users.
// Checks if the authenticated user already has a participantes row.
// If they do → redirect to /aprobacion. If not → show the form.
//
// States:
//   loading      — Checking if user already has a profile
//   form-idle    — Form visible, button enabled
//   form-submit  — Submitting to API, button disabled with spinner
//   error        — Red inline error message
//   redirecting  — Redirecting after success
// =============================================================================

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import WalletConnectButton from '@/components/auth/WalletConnectButton';
import { ErrorAlert, LoadingSkeleton } from '@/components/ui';

type PageState = 'loading' | 'form-idle' | 'form-submit' | 'error' | 'redirecting';

interface FieldErrors {
  nombre?: string;
  rol?: string;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [nombre, setNombre] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [rol, setRol] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // ------------------------------------------------------------------------
  // Check if user already has a profile on mount
  // ------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkExisting() {
      try {
        const res = await fetch('/api/participantes?check_existing=true');

        if (!res.ok) {
          // API error — still show the form (maybe session issue)
          setPageState('form-idle');
          return;
        }

        const data = await res.json();

        if (!cancelled) {
          if (data.exists) {
            // User already has a profile — redirect to dashboard based on role
            if (data.participante?.rol === 'usuario') {
              router.push('/mis-creditos');
            } else {
              router.push('/aprobacion');
            }
          } else {
            setPageState('form-idle');
          }
        }
      } catch {
        if (!cancelled) {
          // Network error — still show the form
          setPageState('form-idle');
        }
      }
    }

    checkExisting();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ------------------------------------------------------------------------
  // Client-side validation
  // ------------------------------------------------------------------------
  const validate = useCallback((): boolean => {
    const errors: FieldErrors = {};

    if (!nombre.trim()) {
      errors.nombre = 'El nombre es requerido';
    } else if (nombre.length > 255) {
      errors.nombre = 'El nombre no puede exceder 255 caracteres';
    }

    if (!rol) {
      errors.rol = 'Selecciona un rol';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [nombre, rol]);

  // ------------------------------------------------------------------------
  // Handle address from WalletConnectButton
  // ------------------------------------------------------------------------
  const handleAddressChange = useCallback((address: string) => {
    setWalletAddress(address);
  }, []);

  // ------------------------------------------------------------------------
  // Submit handler
  // ------------------------------------------------------------------------
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        return;
      }

      setPageState('form-submit');
      setErrorMsg(null);

      try {
        const res = await fetch('/api/participantes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre.trim(),
            wallet_address: walletAddress || undefined,
            rol,
          }),
        });

        if (res.status === 201) {
          setPageState('redirecting');
          // Redirect based on role — usuarios go to GACC first
          if (rol === 'usuario') {
            router.push('/gacc');
          } else {
            router.push('/aprobacion');
          }
          return;
        }

        if (res.status === 401) {
          // Session expired — redirect to login
          router.push('/login');
          return;
        }

        // Parse error response
        const data = await res.json().catch(() => ({}));

        if (res.status === 409) {
          setErrorMsg(data.detail ?? 'Ya tienes un perfil de participante');
          // Shouldn't happen since we checked on mount, but handle it gracefully
          setPageState('redirecting');
          if (rol === 'usuario' || data.participante?.rol === 'usuario') {
            router.push('/mis-creditos');
          } else {
            router.push('/aprobacion');
          }
          return;
        }

        setErrorMsg(data.detail ?? 'Error al crear el perfil. Intenta de nuevo.');
        setPageState('error');
      } catch {
        setErrorMsg('Error de conexión. Verifica tu internet e intenta de nuevo.');
        setPageState('error');
      }
    },
    [nombre, walletAddress, rol, validate, router],
  );

  // ==========================================================================
  // Render: loading state (checking existing profile)
  // ==========================================================================
  if (pageState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <LoadingSkeleton variant="text" />
      </div>
    );
  }

  // ==========================================================================
  // Render: redirecting state
  // ==========================================================================
  if (pageState === 'redirecting') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <LoadingSkeleton variant="text" />
      </div>
    );
  }

  // ==========================================================================
  // Render: form (idle / submitting / error)
  // ==========================================================================
  const isSubmitting = pageState === 'form-submit';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xl shadow-slate-100/40 dark:shadow-black/20 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
            Completa tu Perfil
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            Cuéntanos quién eres para empezar a usar la plataforma
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Nombre */}
          <div>
            <label
              htmlFor="onboarding-nombre"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Nombre completo
            </label>
            <input
              id="onboarding-nombre"
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setFieldErrors((prev) => ({ ...prev, nombre: undefined }));
              }}
              disabled={isSubmitting}
              required
              maxLength={255}
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Tu nombre"
            />
            {fieldErrors.nombre && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.nombre}</p>
            )}
          </div>

          {/* Wallet Address + Connect Button */}
          <div>
            <label
              htmlFor="onboarding-wallet"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Dirección de wallet (opcional)
            </label>
            <div className="flex gap-2">
              <input
                id="onboarding-wallet"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                disabled={isSubmitting}
                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="0x..."
              />
              <WalletConnectButton onAddressChange={handleAddressChange} />
            </div>
          </div>

          {/* Rol */}
          <div>
            <label
              htmlFor="onboarding-rol"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Rol
            </label>
            <select
              id="onboarding-rol"
              value={rol}
              onChange={(e) => {
                setRol(e.target.value);
                setFieldErrors((prev) => ({ ...prev, rol: undefined }));
              }}
              disabled={isSubmitting}
              required
              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">Selecciona un rol</option>
              <option value="usuario">Usuario</option>
            </select>
            {fieldErrors.rol && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.rol}</p>
            )}
          </div>

          {/* Error message */}
          {pageState === 'error' && errorMsg && (
            <ErrorAlert message={errorMsg} />
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                Guardando…
              </>
            ) : (
              'Crear Perfil'
            )}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
