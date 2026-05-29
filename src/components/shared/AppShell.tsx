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
// Profile data needed by the Sidebar
// ---------------------------------------------------------------------------

interface ProfileData {
  nombre: string;
  rol: string;
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

  const isPublic = isPublicRoute(pathname);

  if ((isPublic || !user) && profile !== null) {
    setProfile(null);
  }

  // Fetch participant profile when on a dashboard route and authenticated
  useEffect(() => {
    if (isPublic || !user) {
      return;
    }

    let cancelled = false;

    fetch('/api/participantes?check_existing=true')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          if (data.exists && data.participante) {
            setProfile({
              nombre: data.participante.nombre,
              rol: data.participante.rol,
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
  // Authenticated on dashboard route: show sidebar
  // Use a fallback name/role while profile loads
  // -----------------------------------------------------------------------

  return (
    <Sidebar
      userName={profile?.nombre ?? 'Cargando...'}
      userRole={profile?.rol ?? 'prestatario'}
      userEmail={user.email}
    >
      {children}
    </Sidebar>
  );
}
