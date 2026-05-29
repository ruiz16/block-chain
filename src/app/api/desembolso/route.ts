// =============================================================================
// POST /api/desembolso — Disbursement API Route
// =============================================================================
//
// Flow:
// 1. Parse and validate body via Zod (400 on failure)
// 2. Fetch credit from Supabase with prestatario info (404 if missing)
// 3. Check estado === 'aprobado' (409 if not)
// 4. Check tx_hash === null (409 if already disbursed)
// 5. Check prestatario.score_reputacion > 80 (403 if not)
// 6. Execute desembolsarCredito() via viem (500 on failure, with audit)
// 7. Update credit: estado = 'desembolsado', tx_hash = result
// 8. Insert audit_log with action 'desembolso'
// 9. Return 201 with { status: "desembolsado", tx_hash }
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requireReviewer } from '@/lib/auth-guards';
import { DesembolsoSchema } from '@/lib/validations/desembolso';
import { desembolsarCredito, BlockchainError } from '@/lib/blockchain/desembolsar';
import { registrarAuditLog } from '@/lib/audit/logger';
import { parseWeiFromDb } from '@/config/celo';
import type { Address, Wei } from '@/types/database';

// ---------------------------------------------------------------------------
// Types for Supabase query results (no generated types available)
// ---------------------------------------------------------------------------
interface CreditoConPrestatario {
  id: string;
  monto: string;
  estado: string;
  tx_hash: string | null;
  descripcion: string | null;
  prestatario_id: string;
  participantes: {
    id: string;
    wallet_address: string;
    nombre: string;
    score_reputacion: number;
  } | { id: string; wallet_address: string; nombre: string; score_reputacion: number }[];
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 0. Security guard: Must be admin, aval, or prestamista
    // ------------------------------------------------------------------
    const auth = await requireReviewer(request);
    if (auth instanceof Response) return auth;

    // ------------------------------------------------------------------
    // 1. Parse and validate body
    // ------------------------------------------------------------------
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'CREDIDO_ID_INVALIDO', detail: 'El cuerpo de la solicitud no es un JSON válido' },
        { status: 400 },
      );
    }

    const validation = DesembolsoSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'CREDIDO_ID_INVALIDO',
          detail: validation.error.issues[0]?.message ?? 'UUID inválido',
        },
        { status: 400 },
      );
    }

    const { credito_id } = validation.data;

    // ------------------------------------------------------------------
    // 2. Fetch credit with prestatario info
    // ------------------------------------------------------------------
    const supabase = getSupabaseClient();

    const { data: credito, error: creditoError } = await supabase
      .from('creditos')
      .select(`
        id,
        monto,
        estado,
        tx_hash,
        descripcion,
        prestatario_id,
        participantes!creditos_prestatario_id_fkey (
          id,
          wallet_address,
          nombre,
          score_reputacion
        )
      `)
      .eq('id', credito_id)
      .single();

    if (creditoError || !credito) {
      return NextResponse.json(
        { error: 'CREDITO_NO_ENCONTRADO', detail: 'No se encontró el crédito especificado' },
        { status: 404 },
      );
    }

    const typedCredito = credito as unknown as CreditoConPrestatario;

    // Extract prestatario info from the join
    const rawPrestatario = typedCredito.participantes;
    const prestatario = Array.isArray(rawPrestatario) ? rawPrestatario[0] : rawPrestatario;

    if (!prestatario) {
      return NextResponse.json(
        {
          error: 'CREDITO_NO_ENCONTRADO',
          detail: 'El crédito no tiene un prestatario asociado',
        },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 3. Check estado === 'aprobado'
    // ------------------------------------------------------------------
    if (typedCredito.estado !== 'aprobado') {
      return NextResponse.json(
        {
          error: 'ESTADO_INCORRECTO',
          detail: `El crédito está en estado "${typedCredito.estado}", debe estar en "aprobado"`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 4. Check tx_hash is null (not already disbursed)
    // ------------------------------------------------------------------
    if (typedCredito.tx_hash !== null) {
      return NextResponse.json(
        {
          error: 'YA_DESEMBOLSADO',
          detail: 'Este crédito ya tiene un hash de transacción registrado',
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 5. Check reputation score > 80
    // ------------------------------------------------------------------
    const scoreReputacion = prestatario.score_reputacion;

    if (scoreReputacion <= 80) {
      return NextResponse.json(
        {
          error: 'SCORE_INSUFICIENTE',
          detail: `El score de reputación (${scoreReputacion}) debe ser mayor a 80`,
        },
        { status: 403 },
      );
    }

    // ------------------------------------------------------------------
    // 6. Execute blockchain transfer
    // ------------------------------------------------------------------
    const walletAddress = prestatario.wallet_address as `0x${string}`;
    const monto = typedCredito.monto;

    let txHash: string;

    try {
      txHash = await desembolsarCredito(walletAddress as Address, parseWeiFromDb(monto));
    } catch (blockchainErr) {
      // Record audit log for failed disbursement
      await registrarAuditLog({
        accion: 'desembolso_fallo',
        entidadTipo: 'credito',
        entidadId: typedCredito.id,
        participanteId: prestatario.id,
        detalles: {
          error: blockchainErr instanceof Error ? blockchainErr.message : String(blockchainErr),
          credito_id: typedCredito.id,
          score_reputacion: scoreReputacion,
          monto: typedCredito.monto,
        },
      });

      const statusCode =
        blockchainErr instanceof BlockchainError
          ? 500
          : 500;

      return NextResponse.json(
        {
          error: 'ERROR_INTERNO',
          detail:
            blockchainErr instanceof Error
              ? blockchainErr.message
              : 'Error al ejecutar la transacción en la blockchain',
        },
        { status: statusCode },
      );
    }

    // ------------------------------------------------------------------
    // 7. Update credit record
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('creditos')
      .update({
        estado: 'desembolsado',
        tx_hash: txHash,
      } as never)
      .eq('id', typedCredito.id);

    if (updateError) {
      // Log but still return success — the blockchain tx already happened
      console.warn(
        '[desembolso] Error al actualizar crédito en DB después de tx exitosa:',
        updateError.message,
        { credito_id: typedCredito.id, tx_hash: txHash },
      );
    }

    // ------------------------------------------------------------------
    // 8. Audit log for successful disbursement
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'desembolso',
      entidadTipo: 'credito',
      entidadId: typedCredito.id,
      participanteId: prestatario.id,
      detalles: {
        monto: typedCredito.monto,
        tx_hash: txHash,
        score_reputacion: scoreReputacion,
      },
    });

    // ------------------------------------------------------------------
    // 9. Return success
    // ------------------------------------------------------------------
    return NextResponse.json(
      {
        status: 'desembolsado' as const,
        tx_hash: txHash,
      },
      { status: 201 },
    );
  } catch (err) {
    // ------------------------------------------------------------------
    // Unexpected error — catch-all
    // ------------------------------------------------------------------
    console.error('[desembolso] Error inesperado:', err);

    return NextResponse.json(
      {
        error: 'ERROR_INTERNO',
        detail: err instanceof Error ? err.message : 'Error interno del servidor',
      },
      { status: 500 },
    );
  }
}
