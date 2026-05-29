import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/supabase/auth-server';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * Root Page — Redirect Gateway
 *
 * This page replaces the default Next.js starter page.
 * It checks for an active Supabase session server-side:
 * - Authenticated: Redirects to the appropriate dashboard based on role
 * - Anonymous: Redirects to the login page (/login)
 */
export default async function Home() {
  const cookieStore = await cookies();
  const session = await getServerSession(cookieStore);

  if (session) {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', session.user.id)
      .single();

    const participante = data as { rol: string } | null;

    // Redirect based on role
    if (participante?.rol === 'prestatario') {
      redirect('/mis-creditos');
    } else {
      // Admins, Avals, and Lenders go to the approval panel by default
      redirect('/aprobacion');
    }
  } else {
    // If not logged in, send to login
    redirect('/login');
  }
}
