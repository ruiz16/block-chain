// =============================================================================
// GET /api/notificaciones — Listar notificaciones del usuario
// =============================================================================
//
// Query params:
//   limit  — number (1-50, default 20)
//   offset — number (default 0)
//
// Response:
//   { notificaciones: Notificacion[], total: number }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { NotificacionQuerySchema } from '@/lib/validations/notificaciones';
import { listarNotificaciones } from '@/lib/notificaciones/queries';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validation = NotificacionQuerySchema.safeParse(queryParams);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'PARAMETROS_INVALIDOS', detail: validation.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const { limit, offset } = validation.data;

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
      return NextResponse.json({ error: 'PARTICIPANTE_NO_ENCONTRADO', detail: 'No tienes perfil' }, { status: 404 });
    }

    const result = await listarNotificaciones(participante.id, limit, offset);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[notificaciones] Error:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    );
  }
}
