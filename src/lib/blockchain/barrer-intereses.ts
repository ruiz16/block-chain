// =============================================================================
// barrer-intereses — Barrido de intereses del LendingPool a la wallet raíz
// =============================================================================
//
// Se ejecuta cuando un crédito en pool mode se paga completamente.
// Saca los intereses acumulados del LendingPool y los envía a la wallet raíz
// (0x6C84), dejando el principal en el pool para reciclarse en nuevos créditos.
//
// Flujo:
//   1. Suma monto_interes de todas las cuotas del crédito
//   2. Convierte a wei (18 decimales)
//   3. Simula + ejecuta pool.withdraw(0x6C84, totalInteresWei)
//   4. Audit log del barrido
//
// No bloqueante — si falla (RPC, gas), el crédito ya quedó pagado en BD.
// Se reintenta manualmente desde el panel de admin.
// =============================================================================

import { getPublicClient, getWalletClient, getAccount, assertActiveChain } from '@/lib/blockchain/client';
import { getLendingPoolAddress, parseTokenAmount, getCopmContractAddress } from '@/config/celo';
import { LENDING_POOL_ABI } from '@/lib/blockchain/abis/lendingPool';
import { getSupabaseClient } from '@/lib/supabase/client';
import { registrarAuditLog } from '@/lib/audit/logger';
import { ACTIVE_NETWORK } from '@/config/network';

/**
 * Barra los intereses acumulados de un crédito desde el LendingPool
 * hacia la wallet raíz (0x6C84).
 *
 * @param creditoId - UUID del crédito recién pagado
 * @returns El tx hash si el barrido fue exitoso, null si falló o no había intereses
 */
export async function barrerInteresesACuentaRaiz(
  creditoId: string,
): Promise<`0x${string}` | null> {
  try {
    const supabase = getSupabaseClient();

    // ------------------------------------------------------------------
    // 1. Sumar monto_interes de todas las cuotas del crédito
    // ------------------------------------------------------------------
    const { data: cuotas } = await supabase
      .from('cuotas')
      .select('monto_interes')
      .eq('credito_id', creditoId);

    if (!cuotas || cuotas.length === 0) {
      console.warn(
        '[barrer-intereses] No se encontraron cuotas para el crédito:',
        creditoId,
      );
      return null;
    }

    // Sumar todos los intereses (valor human-readable en COPm)
    let totalInteres = 0n;
    for (const cuota of cuotas) {
      const interes = cuota.monto_interes ?? '0';
      totalInteres += BigInt(interes);
    }

    if (totalInteres <= 0n) {
      console.log(
        '[barrer-intereses] Sin intereses acumulados para crédito:',
        creditoId,
      );
      return null;
    }

    // ------------------------------------------------------------------
    // 2. Convertir a wei (18 decimales) para la blockchain
    // ------------------------------------------------------------------
    const totalInteresWei = parseTokenAmount(totalInteres.toString());

    // ------------------------------------------------------------------
    // 3. Ejecutar withdraw() on-chain
    // ------------------------------------------------------------------
    // GUARD: aborta si el RPC no está en la red esperada (antes de firmar).
    await assertActiveChain();

    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const poolAddress = getLendingPoolAddress();
    // La wallet conectada es CELO_PRIVATE_KEY = 0x6C84 = owner del pool
    const rootAddress = getAccount().address;

    // feeCurrency del barrido: igual que el desembolso, la wallet de plataforma
    // paga gas en COPm en mainnet (sin necesitar CELO). En testnet se omite
    // (el Mock no es fee currency) → gas en CELO, aceptable solo en pruebas.
    const sweepFeeField =
      ACTIVE_NETWORK === 'mainnet' ? { feeCurrency: getCopmContractAddress() } : {};

    const { request } = await publicClient.simulateContract({
      address: poolAddress,
      abi: LENDING_POOL_ABI,
      functionName: 'withdraw',
      args: [rootAddress, totalInteresWei as bigint],
      account: walletClient.account!,
      ...sweepFeeField,
    });

    const txHash = await walletClient.writeContract(request);

    // Esperar confirmación
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    if (receipt.status === 'reverted') {
      console.error(
        '[barrer-intereses] Transacción revertida:',
        { creditoId, totalInteresWei: totalInteresWei.toString(), txHash },
      );
      return null;
    }

    // ------------------------------------------------------------------
    // 4. Audit log
    // ------------------------------------------------------------------
    await registrarAuditLog({
      accion: 'interes_barrido',
      entidadTipo: 'credito',
      entidadId: creditoId,
      detalles: {
        monto_interes_copm: totalInteres.toString(),
        monto_interes_wei: totalInteresWei.toString(),
        tx_hash: txHash,
        destino: rootAddress,
      },
    });

    console.log(
      '[barrer-intereses] Intereses barridos exitosamente:',
      { creditoId, totalInteresCopm: totalInteres.toString(), txHash },
    );

    return txHash as `0x${string}`;
  } catch (err) {
    // No bloqueante: el crédito ya está pagado, el barrido se reintenta manual
    console.error(
      '[barrer-intereses] Error no bloqueante al barrer intereses:',
      err,
      { creditoId },
    );
    return null;
  }
}
