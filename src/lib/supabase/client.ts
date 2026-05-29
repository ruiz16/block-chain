// =============================================================================
// Supabase Service-Role Client (Server-Only)
// =============================================================================
//
// This module creates a SINGLETON Supabase client using the service_role key.
// It is INTENTIONALLY server-only — NEVER import this in client components.
//
// The service_role key bypasses Row-Level Security (RLS). This is intentional:
// the API route handler (backend-to-backend) needs cross-table read/write access
// that would require overly complex RLS policies.
//
// For browser-side queries, use client-browser.ts instead.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Returns a singleton Supabase client configured with the service_role key.
 * Throws a descriptive error if environment variables are missing.
 */
export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  if (!serviceKey) {
    throw new Error(
      'Falta SUPABASE_SERVICE_KEY en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  supabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}
