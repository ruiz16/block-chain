// =============================================================================
// PATCH /api/notificaciones/[id]/leer — Marcar notificación como leída
// =============================================================================
//
// Verifica ownership (que la notificación pertenezca al usuario autenticado).
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { marcarLeida } from '@/lib/notificaciones/queries';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const user = await getServerUser(cookieStore);

    if (!user) {
      return NextResponse.json({ error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    const { data: rawP } = await supabase
      .from('participantes')
      .select('id')
      .eq('user_id', user.id)
      .single();

    const participante = rawP as unknown as { id: string } | null;
    if (!participante) {
      return NextResponse.json({ error: 'PARTICIPANTE_NO_ENCONTRADO' }, { status: 404 });
    }

    await marcarLeida(id, participante.id);

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOTIFICACION_NO_ENCONTRADA') {
      return NextResponse.json({ error: 'NOTIFICACION_NO_ENCONTRADA', detail: 'La notificación no existe o no te pertenece' }, { status: 404 });
    }
    console.error('[notificaciones/leer] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
