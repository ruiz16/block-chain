// =============================================================================
// Middleware — Route Protection + CORS for API
// =============================================================================
//
// Two responsibilities:
//   1. CORS: handles OPTIONS preflight and adds CORS headers to all API routes
//   2. Auth protection: redirects unauthenticated dashboard users to /login
//
// IMPORTANT: Auth protection is a UX improvement, NOT a security boundary.
// The real access control is in each API route handler (defense-in-depth).
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith('/api');

  // ---------------------------------------------------------------------------
  // CORS preflight — respond immediately for OPTIONS requests
  // ---------------------------------------------------------------------------
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  let supabaseResponse = NextResponse.next({ request });

  // ---------------------------------------------------------------------------
  // Auth protection — only for non-API routes (API routes use Bearer/cookies)
  // ---------------------------------------------------------------------------
  if (!isApiRoute) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            supabaseResponse = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              supabaseResponse.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    // Verify the user's JWT with the Supabase Auth server (auto-refreshes if needed)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // No session → redirect to /login with original path as redirect param
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);

      return NextResponse.redirect(loginUrl);
    }

    // Role-based route protection (defense-in-depth)
    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
    const isAprobacionRoute = pathname.startsWith('/aprobacion');

    if (isAdminRoute || isAprobacionRoute) {
      // Use the SSR client (respects RLS — user can only read their own row)
      const { data } = await supabase
        .from('participantes')
        .select('rol')
        .eq('user_id', user.id)
        .single();

      const participante = data as { rol: string } | null;
      const role = participante?.rol;

      // Admin routes: exclusively for 'admin' role
      if (isAdminRoute && role !== 'admin') {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // Aprobacion routes: blocked for 'usuario' role
      if (isAprobacionRoute && (!role || role === 'usuario')) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CORS headers — add to all responses (API + dashboard)
  // ---------------------------------------------------------------------------
  supabaseResponse.headers.set('Access-Control-Allow-Origin', '*');
  supabaseResponse.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  );
  supabaseResponse.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  );

  return supabaseResponse;
}

// Protect dashboard routes AND handle CORS for API routes
export const config = {
  matcher: [
    // Dashboard routes (auth protection)
    '/solicitar',
    '/mis-creditos',
    '/pagos',
    '/gacc',
    '/aprobacion',
    '/perfil',
    '/admin/:path*',
    // API routes (CORS only — auth is per-route)
    '/api/:path*',
  ],
};
