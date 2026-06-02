/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Server Auth Client — @supabase/ssr createServerClient
// =============================================================================
//
// Server-side module for reading and verifying the Supabase Auth session
// using cookie-based session management. Each request creates a new client
// instance because the cookie store is per-request.
//
// Use in:
// - Next.js middleware
// - API route handlers
// - Server components
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Cookie store compatible with Next.js RequestCookies / NextRequest cookies
// We use rest parameters + any to stay compatible across Next.js versions
// where the delete/set signatures may change.
interface CookieStore {
  getAll(): any;
  set?(...args: any[]): void;
  delete?(...args: any[]): void;
}

/**
 * Creates a server-side Supabase client for the given cookie store.
 * The @supabase/ssr client handles cookie reading, setting, and deletion
 * via the provided getAll/setAll callbacks.
 *
 * @param cookieStore - The cookie store from the request (NextRequest.cookies or next/headers cookies())
 */
export function getServerClient(cookieStore: CookieStore): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  if (!anonKey) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  return createServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          if (!cookieStore.set) return;
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

/**
 * Reads the current user from the session. Calls auth.getUser() which
 * verifies the JWT with the Supabase Auth server (not just decoding it locally).
 *
 * @param cookieStore - The request's cookie store
 * @returns The User object or null if not authenticated
 */
export async function getServerUser(
  cookieStore: CookieStore,
): Promise<User | null> {
  const client = getServerClient(cookieStore);
  const { data } = await client.auth.getUser();
  return data.user;
}

/**
 * Reads the current session from the cookie (no server verification).
 * Use auth.getSession() when you need the session token, not user verification.
 *
 * @param cookieStore - The request's cookie store
 * @returns The Session object or null
 */
export async function getServerSession(
  cookieStore: CookieStore,
): Promise<Session | null> {
  const client = getServerClient(cookieStore);
  const { data } = await client.auth.getSession();
  return data.session;
}
