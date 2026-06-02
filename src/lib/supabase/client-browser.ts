// =============================================================================
// Supabase Browser Client (Anonymous Key)
// =============================================================================
//
// This module creates a Supabase client using the anon/public key for use
// in browser components. It respects RLS policies.
//
// DO NOT use this for server-side operations that need elevated privileges.
// Use client.ts (service_role) instead.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton Supabase client configured with the anon/public key.
 */
export function getBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL en las variables de entorno.',
    );
  }

  if (!anonKey) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno.',
    );
  }

  browserClient = createClient<Database>(supabaseUrl, anonKey);

  return browserClient;
}
