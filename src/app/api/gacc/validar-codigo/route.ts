// =============================================================================
// GET /api/gacc/validar-codigo?codigo=XXX — Validar existencia de un GACC
// =============================================================================
//
// Endpoint de SOLO LECTURA usado por el step Register (mobile) ANTES de crear
// el participante. Confirma que el código GACC exista y esté activo, evitando
// que se cree un participante huérfano si la unión posterior fallaría.
//
// Sigue los patrones de los demás endpoints GACC:
// - Auth por cookie → Bearer fallback (mobile)
// - Service-role client para la consulta
// - Códigos de error en español
//
// A diferencia de /api/gacc/unirse, NO requiere un perfil de participante:
// corre antes de que el participante exista.
// =============================================================================

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { getBearerUser } from '@/lib/supabase/auth-bearer';

export async function GET(request: Request): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 1. Verify session (cookies → Bearer token fallback for mobile)
    // ------------------------------------------------------------------
    const cookieStore = await cookies();
    const cookieUser = await getServerUser(cookieStore);
    const bearerResult = !cookieUser ? await getBearerUser(request) : null;
    const user = cookieUser ?? bearerResult?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión para validar un código GACC' },
        { status: 401 },
      );
    }

    // ------------------------------------------------------------------
    // 2. Read and validate the `codigo` query param
    // ------------------------------------------------------------------
    const rawCodigo = new URL(request.url).searchParams.get('codigo');
    const codigo = rawCodigo?.toUpperCase().trim() ?? '';

    if (!codigo || codigo.length > 50) {
      return NextResponse.json(
        { error: 'DATOS_INVALIDOS', detail: 'El código es requerido' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Find GACC by code (read-only)
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();

    const { data: grupo } = await supabase
      .from('grupos_gacc')
      .select('id, nombre, activo, municipio')
      .eq('codigo', codigo)
      .single();

    if (!grupo) {
      return NextResponse.json(
        { error: 'GACC_NO_ENCONTRADO', detail: 'No se encontró un GACC con ese código. Verifica el código e intenta de nuevo.' },
        { status: 404 },
      );
    }

    if (!grupo.activo) {
      return NextResponse.json(
        { error: 'GACC_INACTIVO', detail: 'Este GACC ya no está activo' },
        { status: 410 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Return 200 — código válido
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        valido: true,
        grupo: { id: grupo.id, nombre: grupo.nombre, municipio: grupo.municipio },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[gacc/validar-codigo] Error inesperado:', err);
    return NextResponse.json(
      { error: 'ERROR_INTERNO', detail: err instanceof Error ? err.message : 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
