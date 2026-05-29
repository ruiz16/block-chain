'use client';

// =============================================================================
// Register Page — Email + Password Registration
// =============================================================================
//
// States:
//   idle      — Form visible, button enabled
//   loading   — Button spinner, inputs disabled
//   success   — Confirmation message (email confirmation enabled)
//   error     — Red inline error message
//
// Client-side validation:
//   - Password ≥ 8 characters
//   - Confirmation matches password
//   - Email is valid format (HTML5 type=email handles this)
//
// On success with email confirmation DISABLED: redirects to /onboarding
// On success with email confirmation ENABLED: shows confirmation message
// =============================================================================

import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/supabase/auth-client';

type PageState = 'idle' | 'loading' | 'success' | 'error';

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<PageState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validate = useCallback((): boolean => {
    const errors: FieldErrors = {};

    if (!email.trim()) {
      errors.email = 'El correo electrónico es requerido';
    }

    if (password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password, confirmPassword]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!validate()) {
        setState('error');
        return;
      }

      setState('loading');
      setErrorMsg(null);

      try {
        const { data, error } = await signUp(email, password);

        if (error) {
          const message = mapSignUpError(error.message);
          setErrorMsg(message);
          setState('error');
          return;
        }

        // Check if the session was created immediately (email confirmation disabled)
        if (data.session) {
          // Email confirmation is disabled — user is already authenticated
          router.push('/onboarding');
        } else {
          // Email confirmation is enabled — show success message
          setState('success');
        }
      } catch (err) {
        setErrorMsg('Error de conexión, intenta de nuevo');
        setState('error');
      }
    },
    [email, password, validate, router],
  );

  // ==========================================================================
  // Success state (email confirmation enabled)
  // ==========================================================================
  if (state === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-full bg-green-100 w-16 h-16 flex items-center justify-center mx-auto mb-6">
            <svg
              className="h-8 w-8 text-green-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Revisa tu correo
          </h1>
          <p className="text-gray-600">
            Te hemos enviado un correo de confirmación a{' '}
            <strong>{email}</strong>. Haz clic en el enlace para activar tu
            cuenta.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Form state (idle / loading / error)
  // ==========================================================================
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Crear Cuenta
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="register-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Correo electrónico
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              disabled={state === 'loading'}
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="correo@ejemplo.com"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Contraseña
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              disabled={state === 'loading'}
              required
              minLength={8}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Mínimo 8 caracteres"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="register-confirm-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirmar contraseña
            </label>
            <input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              disabled={state === 'loading'}
              required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Repite la contraseña"
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.confirmPassword}
              </p>
            )}
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
                Creando cuenta…
              </>
            ) : (
              'Crear Cuenta'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Maps Supabase sign-up error messages to user-friendly Spanish messages.
 */
function mapSignUpError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('already registered') || lower.includes('user already exists')) {
    return 'Este correo ya está registrado';
  }

  if (lower.includes('weak password') || lower.includes('password')) {
    return 'La contraseña es muy débil. Debe tener al menos 8 caracteres';
  }

  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Demasiados intentos, espera unos segundos';
  }

  return message;
}
