// =============================================================================
// Browser Auth Client — @supabase/ssr createBrowserClient
// =============================================================================
//
// Client-side module for Supabase Auth operations. Uses @supabase/ssr's
// createBrowserClient which handles cookie lifecycle automatically.
//
// ONLY import this in client components ('use client').
// For server-side auth, use auth-server.ts instead.
// =============================================================================

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let authClient: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton Supabase browser client configured for Auth.
 * Uses the anon key — RLS policies enforce access control.
 */
export function getAuthClient(): SupabaseClient<Database> {
  if (authClient) return authClient;

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

  authClient = createBrowserClient<Database>(supabaseUrl, anonKey);

  return authClient;
}

/**
 * Sign up a new user with email + password.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ data: { user: User | null; session: Session | null }; error: Error | null }> {
  const client = getAuthClient();
  const { data, error } = await client.auth.signUp({ email, password });

  if (error) {
    return { data: { user: null, session: null }, error };
  }

  return { data, error: null };
}

/**
 * Sign in with email + password.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ data: { user: User | null; session: Session | null }; error: Error | null }> {
  const client = getAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { data: { user: null, session: null }, error };
  }

  return { data, error: null };
}

/**
 * Sign out the current user — clears the session cookie.
 */
export async function signOut(): Promise<void> {
  const client = getAuthClient();
  await client.auth.signOut();
}

/**
 * Get the current auth session.
 */
export async function getAuthSession(): Promise<Session | null> {
  const client = getAuthClient();
  const { data } = await client.auth.getSession();
  return data.session;
}

/**
 * Get the currently authenticated user — convenience wrapper around getSession().
 * Useful for client-side checks after SIWE redirect.
 */
export async function getAuthUser(): Promise<User | null> {
  const client = getAuthClient();
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}
