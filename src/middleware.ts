// =============================================================================
// Middleware — Route Protection + CORS for API
// =============================================================================
//
// Three responsibilities:
//   1. CORS: handles OPTIONS preflight and adds CORS headers to all responses
//   2. Dashboard auth: redirects unauthenticated users to /login
//   3. Admin-only dashboard: en esta fase, SOLO usuarios con rol 'admin'
//      pueden acceder a las rutas del dashboard (solicitar, mis-creditos, etc.)
//
// IMPORTANT: This is defense-in-depth. The real access control is enforced
// in each API route handler. The API routes are NOT modified — solo se
// protege el frontend del dashboard.
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
  // Dashboard protection — SOLO para rutas no-API
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

    // Verify the user's JWT with the Supabase Auth server
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // No session → redirect to /login
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ── Admin-only phase ──────────────────────────────────────────────
    //
    // Fase actual: SOLO administradores pueden usar el dashboard.
    // Buscamos el rol del usuario en la tabla participantes.
    // Si no es 'admin', redirigimos a /login.
    // ──────────────────────────────────────────────────────────────────
    const { data: participante } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    const role = (participante as { rol: string } | null)?.rol;

    if (role !== 'admin') {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('reason', 'admin_only');
      return NextResponse.redirect(loginUrl);
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
    // Dashboard routes (auth + admin check)
    '/solicitar',
    '/mis-creditos',
    '/pagos',
    '/gacc',
    '/aprobacion',
    '/perfil',
    '/notificaciones',
    '/onboarding',
    '/admin/:path*',
    // API routes (CORS only — auth is per-route)
    '/api/:path*',
  ],
};
