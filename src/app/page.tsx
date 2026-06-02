'use client';

// =============================================================================
// Root Page — Redirect Gateway (Client-Side)
// =============================================================================
//
// Client-side redirect based on auth state:
// - Authenticated: Redirects to the appropriate dashboard based on role
// - Anonymous: Redirects to the login page (/login)
//
// The /api/participantes?check_existing=true endpoint handles session
// verification server-side, so no SSR is needed here.
// =============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthClient } from '@/lib/supabase/auth-client';

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'redirecting'>('checking');

  useEffect(() => {
    let cancelled = false;

    async function redirectBySession() {
      const client = getAuthClient();
      const { data: { session } } = await client.auth.getSession();

      if (!session) {
        if (!cancelled) {
          setStatus('redirecting');
          router.replace('/login');
        }
        return;
      }

      try {
        const res = await fetch('/api/participantes?check_existing=true');
        const data = await res.json();

        if (!cancelled) {
          setStatus('redirecting');
          if (data.exists && data.participante?.rol === 'usuario') {
            // Usuarios without a GACC need to create/join one first
            if (!data.participante.gacc_id) {
              router.replace('/gacc');
            } else {
              router.replace('/mis-creditos');
            }
          } else {
            // Admins, Avals, and Lenders go to the approval panel
            router.replace('/aprobacion');
          }
        }
      } catch {
        if (!cancelled) {
          setStatus('redirecting');
          router.replace('/login');
        }
      }
    }

    redirectBySession();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen" role="status">
      <div className="flex flex-col items-center gap-3">
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
        <p className="text-sm text-gray-500">
          {status === 'checking' ? 'Verificando sesión…' : 'Redirigiendo…'}
        </p>
      </div>
    </div>
  );
}
