import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getServerUser } from '@/lib/supabase/auth-server';
import { registrarAuditLog } from '@/lib/audit/logger';

export async function POST(request: NextRequest): Promise<Response> {
  const cookieStore = await cookies();
  const user = await getServerUser(cookieStore);

  if (!user) {
    return NextResponse.json(
      { error: 'NO_AUTENTICADO', detail: 'Debes iniciar sesión' },
      { status: 401 },
    );
  }

  const supabase = getSupabaseClient();

  const { data: participante } = await supabase
    .from('participantes')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!participante) {
    return NextResponse.json(
      { error: 'NO_AUTENTICADO', detail: 'No hay participante asociado' },
      { status: 401 },
    );
  }

  const body: { credito_id?: string; cuota_id?: string } | null = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: 'DATOS_INVALIDOS', detail: 'Cuerpo inválido' },
      { status: 400 },
    );
  }

  let creditoId = body.credito_id;

  if (!creditoId && body.cuota_id) {
    const { data: cuota } = await supabase
      .from('cuotas')
      .select('credito_id')
      .eq('id', body.cuota_id)
      .single();

    if (!cuota) {
      return NextResponse.json(
        { error: 'CUOTA_NO_ENCONTRADA', detail: 'No se encontró la cuota' },
        { status: 404 },
      );
    }
    creditoId = cuota.credito_id;
  }

  if (!creditoId) {
    return NextResponse.json(
      { error: 'CREDIDO_ID_INVALIDO', detail: 'Falta credito_id o cuota_id' },
      { status: 400 },
    );
  }

  // Verify the credit belongs to this user
  const { data: credito, error: fetchError } = await supabase
    .from('creditos')
    .select('id, estado, monto, prestatario_id')
    .eq('id', creditoId)
    .eq('prestatario_id', participante.id)
    .single();

  if (fetchError || !credito) {
    return NextResponse.json(
      { error: 'CREDITO_NO_ENCONTRADO', detail: 'No existe el crédito o no te pertenece' },
      { status: 404 },
    );
  }

  if (credito.estado !== 'aprobado') {
    return NextResponse.json(
      { error: 'ESTADO_INCORRECTO', detail: `El crédito está en "${credito.estado}", no en "aprobado" — no necesita arreglo` },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from('creditos')
    .update({ estado: 'desembolsado' } as never)
    .eq('id', credito.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'ERROR_ACTUALIZANDO', detail: updateError.message },
      { status: 500 },
    );
  }

  await registrarAuditLog({
    accion: 'desembolso',
    entidadTipo: 'credito',
    entidadId: credito.id,
    participanteId: credito.prestatario_id,
    detalles: {
      estado_anterior: 'aprobado',
      estado_nuevo: 'desembolsado',
      fix: true,
    },
  });

  return NextResponse.json({
    status: 'ok',
    detail: `Crédito ${credito.id} actualizado de "aprobado" a "desembolsado"`,
  });
}
