'use client';

// =============================================================================
// AppShell — Conditional Sidebar Layout
// =============================================================================
//
// Client component that wraps the entire app and decides whether to show the
// sidebar based on the current route.
//
// Public routes (login, register, onboarding, auth) render without sidebar.
// Protected routes (dashboard) render with the Sidebar + profile data.
//
// This lives in the root layout so the sidebar is part of Next.js's layout
// hierarchy, but only activates on the routes that need it.
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import Sidebar from '@/components/shared/Sidebar';

// ---------------------------------------------------------------------------
// Public routes that should NOT show the sidebar
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/onboarding',
  '/auth/callback',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
}

// ---------------------------------------------------------------------------
// Profile data needed by the Sidebar + wallet guard
// ---------------------------------------------------------------------------

interface ProfileData {
  id: string;
  nombre: string;
  rol: string;
  wallet_address: string;
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [walletWarningDismissed, setWalletWarningDismissed] = useState(false);

  const isPublic = isPublicRoute(pathname);

  // Fetch participant profile when on a dashboard route and authenticated.
  // Also resets profile when navigating to public routes or after logout.
  useEffect(() => {
    if (isPublic || !user) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    fetch('/api/participantes?check_existing=true')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (data.exists && data.participante) {
            setProfile({
              id: data.participante.id,
              nombre: data.participante.nombre,
              rol: data.participante.rol,
              wallet_address: data.participante.wallet_address ?? '',
            });
          } else {
            setProfile(null);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPublic, user]);

  // Determine whether to show wallet warning
  const needsWallet = profile?.rol === 'prestatario' && !profile.wallet_address && !walletWarningDismissed;

  // -----------------------------------------------------------------------
  // Public routes: no sidebar, just children
  // -----------------------------------------------------------------------

  if (isPublic) {
    return <>{children}</>;
  }

  // -----------------------------------------------------------------------
  // Auth loading: show children without sidebar (layout flash guard)
  // -----------------------------------------------------------------------

  if (authLoading) {
    return <>{children}</>;
  }

  // -----------------------------------------------------------------------
  // Not authenticated on a protected route: show children as-is
  // (the page itself or middleware will handle the redirect)
  // -----------------------------------------------------------------------

  if (!user) {
    return <>{children}</>;
  }

  // -----------------------------------------------------------------------
  // Profile not loaded yet — render children without sidebar to avoid
  // flashing the wrong role in the sidebar (Bug fix: was defaulting to
  // 'prestatario' before profile fetch completed).
  // -----------------------------------------------------------------------

  if (!profile) {
    return <>{children}</>;
  }

  // -----------------------------------------------------------------------
  // Authenticated + profile loaded: show sidebar
  // -----------------------------------------------------------------------

  return (
    <Sidebar
      userName={profile.nombre}
      userRole={profile.rol}
      userEmail={user.email}
    >
      {needsWallet && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex items-center justify-between gap-3" role="alert">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-500 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <span className="font-medium">Wallet no configurada.</span>{' '}
                Para pagar tus cuotas necesitas conectar tu wallet de Celo.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="/perfil"
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                Configurar
              </a>
              <button
                onClick={() => setWalletWarningDismissed(true)}
                className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors"
                aria-label="Descartar aviso"
              >
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {children}
    </Sidebar>
  );
}
