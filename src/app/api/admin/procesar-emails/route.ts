// =============================================================================
// POST /api/admin/procesar-emails — Procesar cola de emails (admin)
// =============================================================================
//
// Admin-only endpoint que ejecuta el procesamiento de la cola de emails.
// Por ahora es un stub que loguea a consola; cuando se integre con un
// provider (SendGrid, Resend, etc.) hará el envío real.
//
// Response:
//   { status: 'ok', procesados: number, fallidos: number }
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { procesarCola } from '@/lib/email/sender';

export async function POST(): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: rawP } = await supabase
      .from('participantes')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { rol: string } | null;

    if (!participante || participante.rol !== 'admin') {
      return NextResponse.json({ error: 'NO_AUTORIZADO' }, { status: 403 });
    }

    const result = await procesarCola();

    return NextResponse.json({ status: 'ok', ...result }, { status: 200 });
  } catch (err) {
    console.error('[admin/procesar-emails] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
