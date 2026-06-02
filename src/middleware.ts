// =============================================================================
// Middleware — Route Protection
// =============================================================================
//
// Protects dashboard routes by checking the Supabase Auth session.
// Unauthenticated users are redirected to /login with the original
// path preserved in the ?redirect= query parameter.
//
// For /admin/* and /api/admin/* routes, additionally checks that the
// authenticated user has rol = 'admin' in the participantes table.
// Non-admin users are redirected to /login (UX improvement).
//
// IMPORTANT: This is a UX improvement, NOT a security boundary.
// The real access control is in requireAdmin() inside each API route.
// Defense-in-depth: middleware for UX, API guard for security.
//
// The @supabase/ssr createServerClient handles cookie read/write and
// token refresh transparently via the getAll/setAll callbacks.
// =============================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Role-based route protection (defense-in-depth)
  const pathname = request.nextUrl.pathname;
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

    // Aprobacion routes: blocked for 'prestatario' role
    if (isAprobacionRoute && (!role || role === 'prestatario')) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Allow through to the protected route
  return supabaseResponse;
}

// Only run middleware on dashboard routes
export const config = {
  matcher: [
    '/solicitar',
    '/mis-creditos',
    '/pagos',
    '/gacc',
    '/aprobacion',
    '/perfil',
    '/admin/:path*',
  ],
};
