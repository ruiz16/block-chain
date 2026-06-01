'use client';

// =============================================================================
// AuthProvider — Authentication Context Provider
// =============================================================================
//
// Provides authentication state to the entire application via React context.
// On mount, checks for an existing session and subscribes to auth state
// changes (e.g., session expiry, logout from other tabs).
//
// Context value exposes:
//   user             — Supabase User object or null
//   session          — Supabase Session object or null
//   isLoading        — True during initial session fetch
//   isAuthenticated  — Shortcut for user !== null
//   signOut          — Function to sign the user out
// =============================================================================

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getAuthClient } from '@/lib/supabase/auth-client';
import type { User, Session } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Context Type
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook to access auth context. Throws if used outside of AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth debe usarse dentro de un <AuthProvider>. ' +
        'Asegúrate de que el proveedor esté en el layout raíz.',
    );
  }

  return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ------------------------------------------------------------------------
  // Check existing session on mount + subscribe to auth state changes
  // ------------------------------------------------------------------------
  useEffect(() => {
    const client = getAuthClient();

    // 1. Check if there's already a session
    client.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    // 2. Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ------------------------------------------------------------------------
  // Sign out handler
  // ------------------------------------------------------------------------
  const signOut = useCallback(async () => {
    const client = getAuthClient();
    await client.auth.signOut();
    // Force full-page redirect to clear ALL stale React state and caches.
    // The onAuthStateChange callback clears user/session in context, but
    // page content (fetched data, router cache) can linger without a hard nav.
    window.location.href = '/login';
  }, []);

  // ------------------------------------------------------------------------
  // Context value
  // ------------------------------------------------------------------------
  const value: AuthContextValue = {
    user,
    session,
    isLoading,
    isAuthenticated: user !== null,
    signOut,
  };

  // Show a full-page spinner during initial session check
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        aria-busy="true"
        role="status"
      >
        <svg
          className="animate-spin h-10 w-10 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="sr-only">Verificando sesión…</span>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
