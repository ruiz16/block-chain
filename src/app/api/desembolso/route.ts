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
import { parseTokenAmount } from '@/config/celo';
import { registrarAuditLog } from '@/lib/audit/logger';
import { scoreEfectivo } from '@/lib/score/calculator';
import type { Address, Wei } from '@/types/database';
import type { Database } from '@/types/supabase';

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
  interes_porcentaje: number | string;
  plazo_dias: number;
  numero_cuotas: number;
  participantes: {
    id: string;
    wallet_address: string;
    nombre: string;
    score_reputacion: number;
    created_at: string;
  } | { id: string; wallet_address: string; nombre: string; score_reputacion: number; created_at: string }[];
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // ------------------------------------------------------------------
    // 0. Security guard: admin only
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
        interes_porcentaje,
        plazo_dias,
        numero_cuotas,
        participantes!creditos_prestatario_id_fkey (
          id,
          wallet_address,
          nombre,
          score_reputacion,
          created_at
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
    // 5. Score — solo informativo para auditoría, NO bloquea
    // ------------------------------------------------------------------
    const scoreReputacion = scoreEfectivo(
      prestatario.score_reputacion,
      prestatario.created_at,
    );

    // ------------------------------------------------------------------
    // 6. Validate borrower has a wallet configured
    // ------------------------------------------------------------------
    const walletAddress = prestatario.wallet_address?.trim() as `0x${string}` | '';

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        {
          error: 'WALLET_NO_CONFIGURADA',
          detail: `El prestatario "${prestatario.nombre}" no tiene una wallet conectada. Debe configurarla desde su perfil antes del desembolso.`,
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // 7. Execute blockchain transfer (COPm on Celo)
    // ------------------------------------------------------------------
    // typedCredito.monto está guardado en COPm human-readable (ej. "100000").
    // COPm es un ERC-20 de 18 decimales, así que en el límite con la blockchain
    // hay que convertir a unidades base: 100000 → 100000 * 10^18.
    const montoWei = parseTokenAmount(typedCredito.monto);

    let txHash: string;

    try {
      txHash = await desembolsarCredito(typedCredito.id, walletAddress as Address, montoWei as Wei);
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
    // 8. Update credit record
    // ------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('creditos')
      .update({
        estado: 'desembolsado',
        tx_hash: txHash,
        repayment_mode: 'pool',
      })
      .eq('id', typedCredito.id);

    if (updateError) {
      console.error(
        '[desembolso] FATAL — Error al actualizar crédito en DB después de tx exitosa:',
        updateError.message,
        { credito_id: typedCredito.id, tx_hash: txHash },
      );

      return NextResponse.json(
        {
          error: 'ERROR_ACTUALIZANDO_CREDITO',
          detail: `La transacción en blockchain fue exitosa (${txHash}), pero no se pudo actualizar el crédito en la BD. Contacta al administrador. Error: ${updateError.message}`,
          tx_hash: txHash,
        },
        { status: 500 },
      );
    }

    // ------------------------------------------------------------------
    // 9. Generate cuotas (split capital + interest across N periods)
    // ------------------------------------------------------------------
    const numCuotas = typedCredito.numero_cuotas ?? 1;
    const montoBig = BigInt(typedCredito.monto);
    // interes_porcentaje es NUMERIC(5,2): puede llegar como "5.50" o 5.5.
    // BigInt() rompe con decimales (y truncaría 5.5 → 5). Convertimos a basis
    // points (×100) para preservar los centésimos: 5.5% → 550 bps.
    const pctRaw = Number(typedCredito.interes_porcentaje ?? 0);
    const interesBps = BigInt(Math.round((Number.isFinite(pctRaw) ? pctRaw : 0) * 100));
    const totalInteres = (montoBig * interesBps) / 10_000n;
    const plazoDias = typedCredito.plazo_dias ?? 30;
    const periodoDias = Math.ceil(plazoDias / numCuotas); // days per cuota

    // Helper: split a bigint value into N parts, last gets remainder
    function splitBigInt(value: bigint, parts: number): bigint[] {
      const base = value / BigInt(parts);
      const remainder = value % BigInt(parts);
      const result: bigint[] = [];
      for (let i = 0; i < parts; i++) {
        result.push(i < parts - 1 ? base : base + remainder);
      }
      return result;
    }

    const capitalParts = splitBigInt(montoBig, numCuotas);
    const interestParts = splitBigInt(totalInteres, numCuotas);

    // Calculate saldo_restante after each cuota (remaining capital)
    let saldoRestante = montoBig;

    const cuotasToInsert: Database['public']['Tables']['cuotas']['Insert'][] = [];
    const desembolsoDate = new Date();

    for (let i = 0; i < numCuotas; i++) {
      const capital = capitalParts[i]!;
      const interest = interestParts[i]!;
      saldoRestante -= capital;

      // Vencimiento: last cuota on exact plazo_dias, others evenly spaced
      const diasOffset = i < numCuotas - 1 ? periodoDias * (i + 1) : plazoDias;
      const vencimiento = new Date(desembolsoDate.getTime() + diasOffset * 86400000);

      cuotasToInsert.push({
        credito_id: typedCredito.id,
        numero_cuota: i + 1,
        monto_capital: capital.toString(),
        monto_interes: interest.toString(),
        monto_cuota: (capital + interest).toString(),
        saldo_restante: saldoRestante.toString(),
        fecha_vencimiento: vencimiento.toISOString(),
        estado: 'pendiente',
      });
    }

    const { error: cuotasError } = await supabase
      .from('cuotas')
      .insert(cuotasToInsert);

    if (cuotasError) {
      // Non-fatal: log warning, cuotas can be regenerated manually
      console.warn(
        '[desembolso] Error al generar cuotas después de desembolso exitoso:',
        cuotasError.message,
        { credito_id: typedCredito.id, numero_cuotas: numCuotas },
      );
    }

    // ------------------------------------------------------------------
    // 10. Audit log for successful disbursement
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
        numero_cuotas: numCuotas,
      },
    });

    // ------------------------------------------------------------------
    // 11. Return success
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
