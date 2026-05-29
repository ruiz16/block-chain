// =============================================================================
// Auth Callback — Route Handler
// =============================================================================
//
// Processes the auth code returned by Supabase after email confirmation
// or OAuth redirect. Exchanges the code for a session and redirects the
// user to their intended destination.
//
// Route: GET /auth/callback?code=...&next=...
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  // Missing code → redirect to login with error
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=CODIGO_INVALIDO', request.url));
  }

  // Validate the 'next' param to prevent open redirect
  const destination = next && next.startsWith('/') ? next : '/onboarding';

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      },
    );

    // Exchange the auth code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] Error exchanging code:', error.message);
      return NextResponse.redirect(new URL('/login?error=CODIGO_INVALIDO', request.url));
    }

    // Redirect to the destination
    return NextResponse.redirect(new URL(destination, request.url));
  } catch (err) {
    console.error('[auth/callback] Unexpected error:', err);
    return NextResponse.redirect(new URL('/login?error=ERROR_INTERNO', request.url));
  }
}
