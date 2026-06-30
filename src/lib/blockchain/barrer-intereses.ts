// =============================================================================
// barrer-intereses — Barrido de intereses del LendingPool al treasury
// =============================================================================
//
// Se dispara cuando un crédito en pool mode se paga completamente.
// Con el contrato v2 el interés se contabiliza ON-CHAIN (pendingInterest):
//   - repay() acumula el interés cobrado en pendingInterest.
//   - sweepInterest() barre TODO ese interés al treasury (la fundación).
// Ya NO sumamos la DB: el monto vive on-chain, es trustless e idempotente.
//
// No bloqueante — si falla (RPC, gas), el crédito ya quedó pagado en BD y el
// interés sigue seguro en el pool (no se re-presta: availableLiquidity lo excluye).
// El próximo barrido lo recupera todo.
// =============================================================================

import { getPublicClient, getWalletClient, assertActiveChain } from '@/lib/blockchain/client';
import { getLendingPoolAddress, getCopmContractAddress } from '@/config/celo';
import { LENDING_POOL_ABI } from '@/lib/blockchain/abis/lendingPool';
import { registrarAuditLog } from '@/lib/audit/logger';
import { ACTIVE_NETWORK } from '@/config/network';

/**
 * Barre el interés acumulado del LendingPool hacia el treasury (sweepInterest v2).
 * Es global: barre TODO el pendingInterest del pool, no solo el de un crédito.
 *
 * @param creditoId - UUID del crédito que disparó el barrido (solo para auditoría/log)
 * @returns El tx hash si barrió, null si no había interés pendiente o si falló
 */
export async function barrerInteresesACuentaRaiz(
  creditoId: string,
): Promise<`0x${string}` | null> {
  try {
    // GUARD: aborta si el RPC no está en la red esperada (antes de firmar).
    await assertActiveChain();

    const publicClient = getPublicClient();
    const walletClient = getWalletClient();
    const poolAddress = getLendingPoolAddress();

    // 1. ¿Hay interés pendiente? Lo leemos on-chain para evitar disparar una tx
    //    que revertiría con NothingToSweep (que tratamos como no-op).
    const pending = (await publicClient.readContract({
      address: poolAddress,
      abi: LENDING_POOL_ABI,
      functionName: 'pendingInterest',
    })) as bigint;

    if (pending === 0n) {
      console.log('[barrer-intereses] Sin interés pendiente que barrer.', { creditoId });
      return null;
    }

    // 2. feeCurrency: la wallet de plataforma paga gas en COPm en mainnet (sin
    //    necesitar CELO). En testnet se omite (el Mock no es fee currency).
    const sweepFeeField =
      ACTIVE_NETWORK === 'mainnet' ? { feeCurrency: getCopmContractAddress() } : {};

    // 3. sweepInterest() — barre todo el pendingInterest al treasury (destino fijo
    //    en el contrato; este call es permissionless por diseño).
    const { request } = await publicClient.simulateContract({
      address: poolAddress,
      abi: LENDING_POOL_ABI,
      functionName: 'sweepInterest',
      account: walletClient.account!,
      ...sweepFeeField,
    });

    const txHash = await walletClient.writeContract(request);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });

    if (receipt.status === 'reverted') {
      console.error('[barrer-intereses] sweepInterest revertido:', { creditoId, txHash });
      return null;
    }

    // 4. Audit log
    await registrarAuditLog({
      accion: 'interes_barrido',
      entidadTipo: 'credito',
      entidadId: creditoId,
      detalles: {
        monto_interes_wei: pending.toString(),
        tx_hash: txHash,
        nota: 'sweepInterest() global — barre todo el pendingInterest del pool al treasury',
      },
    });

    console.log('[barrer-intereses] Interés barrido (global):', {
      creditoId,
      pendingWei: pending.toString(),
      txHash,
    });

    return txHash as `0x${string}`;
  } catch (err) {
    // No bloqueante: el crédito ya está pagado; el interés sigue en el pool.
    console.error('[barrer-intereses] Error no bloqueante al barrer intereses:', err, { creditoId });
    return null;
  }
}
