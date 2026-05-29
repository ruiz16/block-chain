'use client';

// =============================================================================
// Login Page — Email + Password Authentication
// =============================================================================
//
// States:
//   idle      — Form visible, button enabled
//   loading   — Button spinner, inputs disabled
//   error     — Red inline error message
//
// Auth guard:
//   If the user already has an active session (e.g., they navigated back to
//   /login after logging in), they are immediately redirected to the dashboard
//   or the original requested route.
//
// On success: fetches existing row via GET /api/participantes?check_existing=true
//   - Has row  → redirect to original requested route or /aprobacion
//   - No row   → redirect to /onboarding
// =============================================================================

import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/supabase/auth-client';
import { useAuth } from '@/components/auth/AuthProvider';

type PageState = 'idle' | 'loading' | 'error';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const redirectTo = searchParams?.get('redirect') ?? '/mis-creditos';

  // --------------------------------------------------------------------------
  // Auth guard: if already logged in, redirect immediately
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push(redirectTo);
    }
  }, [authLoading, isAuthenticated, redirectTo, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<PageState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!email.trim() || !password.trim()) {
        setErrorMsg('Correo electrónico y contraseña son requeridos');
        setState('error');
        return;
      }

      setState('loading');
      setErrorMsg(null);

      try {
        const { error } = await signIn(email, password);

        if (error) {
          // Map Supabase error codes to friendly Spanish messages
          const status = (error as { status?: number }).status;
          const message = mapAuthError(error.message, status);
          setErrorMsg(message);
          setState('error');
          return;
        }

        // Check if user already has a participantes row
        const checkRes = await fetch('/api/participantes?check_existing=true');

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.exists) {
            router.push(redirectTo);
          } else {
            router.push('/onboarding');
          }
        } else {
          // API error — redirect anyway (safe fallback)
          router.push(redirectTo);
        }
      } catch (err) {
        setErrorMsg('Error de conexión, intenta de nuevo');
        setState('error');
      }
    },
    [email, password, redirectTo, router],
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Iniciar Sesión
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Correo electrónico
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={state === 'loading'}
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="correo@ejemplo.com"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={state === 'loading'}
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </div>

          {/* Error message */}
          {state === 'error' && errorMsg && (
            <div
              className="rounded-md bg-red-50 border border-red-200 p-3"
              role="alert"
            >
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={state === 'loading'}
            className="w-full inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state === 'loading' ? (
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
                Iniciando sesión…
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿No tienes cuenta?{' '}
          <Link
            href="/register"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Registrarse
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Maps Supabase Auth error codes/messages to user-friendly Spanish messages.
 */
function mapAuthError(message: string, status?: number): string {
  const lower = message.toLowerCase();

  if (status === 429 || lower.includes('rate limit') || lower.includes('too many')) {
    return 'Demasiados intentos, espera unos segundos';
  }

  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos';
  }

  if (lower.includes('email not confirmed')) {
    return 'Revisa tu correo para confirmar la cuenta';
  }

  if (lower.includes('user not found')) {
    return 'No hay una cuenta con este correo electrónico';
  }

  return message;
}
