/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

// =============================================================================
// PanelPagos — Per-Cuota Payment Dashboard with MetaMask
// =============================================================================
//
// COPm (Mento Colombian Peso) is used for all payments.
// COPm is an ERC-20 with 18 decimals — same interface as cUSD.
//
// Payment options:
// 1. MetaMask — sends COPm directly from user's wallet (needs CELO for gas)
// 2. Manual — user pays from MiniPay/Valora and pastes the tx hash
//
// For the best UX, recommend users to pay via MiniPay (pays gas in COPm)
// and paste the hash in the Manual field.
//
// States:
//   loading       — Spinner while fetching cuotas from API
//   empty         — No cuotas at all
//   no-pending    — All cuotas are paid
//   list          — Table of cuotas grouped by credit
//   connecting    — Connecting to MetaMask
//   submitting    — Waiting for MetaMask tx confirmation + API response
//   success       — Green banner (auto-dismiss 5s)
//   error         — Red banner with error detail + [Reintentar] button
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { createWalletClient, custom, createPublicClient, http } from 'viem';
import { getCopmContractAddress, getPlatformWalletAddressPublic, getLendingPoolAddress, parseTokenAmount } from '@/config/celo';
import { getActiveChain } from '@/config/network';
import { ERC20_ABI } from '@/lib/blockchain/abis/erc20';
import { LENDING_POOL_ABI } from '@/lib/blockchain/abis/lendingPool';
import { creditIdHash } from '@/lib/blockchain/credit-id';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import type { CuotaAdmin } from '@/app/api/admin/cuotas/route';

type PanelState = 'loading' | 'empty' | 'no-pending' | 'list' | 'connecting' | 'submitting' | 'success' | 'error';

// =============================================================================
// Error message mapping
// =============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  TX_NO_ENCONTRADA: 'La transacción no existe en la blockchain',
  TX_REVERTIDA: 'La transacción fue revertida en la blockchain',
  TX_DESTINO_INVALIDO: 'La transacción no es al contrato de COPm',
  TX_MONTO_INSUFICIENTE: 'El monto enviado es menor al valor de la cuota',
  TX_BENEFICIARIO_INVALIDO: 'El destinatario no es la wallet de la plataforma',
  ESTADO_INCORRECTO: 'La cuota no está en estado de pago pendiente',
  YA_PAGADA: 'Esta cuota ya fue pagada',
  TX_HASH_DUPLICADO: 'Este hash de transacción ya fue registrado',
  ERROR_INTERNO: 'Error del servidor. Intenta de nuevo más tarde',
};

const NETWORK_ERROR = 'Error de conexión. Verifica tu conexión a internet';
const TX_HASH_REGEX = /^0x[a-f0-9]{64}$/i;

// =============================================================================
// Helper: format COPm with 2 decimals
//
// The values in cuotas.monto_cuota / credito.monto are in COPm.
// COPm = COP (pegged 1:1), so COPm amount IS the peso amount.
// No conversion needed — unlike the old cUSD system.
// =============================================================================

/** Format COPm/COP with locale formatting */
function formatCop(value: string): string {
  try {
    const num = Number(value);
    if (isNaN(num)) return '$0';
    return '$' + num.toLocaleString('es-CO', { minimumFractionDigits: 2 });
  } catch {
    return '$0';
  }
}

// =============================================================================
// Helper: esperar a que el allowance se refleje on-chain
//
// El flujo de pago al pool son 2 transacciones: approve(pool, monto) y luego
// repay(creditId, monto). Las wallets que simulan transacciones (Rabby,
// MetaMask) simulan el repay contra el ÚLTIMO estado on-chain; si el approve
// aún no se propagó al nodo, la simulación predice allowance 0, falla la
// simulación y tumba la transacción. Hacemos polling del allowance hasta que
// sea >= al monto requerido ANTES de enviar el repay para eliminar ese race.
// =============================================================================

async function waitForAllowance(
  publicClient: any,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  required: bigint,
  tries = 15,
  delayMs = 1500,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const allowance = (await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    })) as bigint;
    if (allowance >= required) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('El permiso (allowance) no se reflejó a tiempo. Reintenta el pago.');
}

// =============================================================================
// Component
// =============================================================================

export default function PanelPagos() {
  const [state, setState] = useState<PanelState>('loading');
  const [cuotas, setCuotas] = useState<CuotaAdmin[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeCuotaId, setActiveCuotaId] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState<string | null>(null);
  const [manualTxHash, setManualTxHash] = useState('');
  const [manualTxError, setManualTxError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch cuotas on mount — admin endpoint, returns ALL cuotas
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function fetchCuotas() {
      try {
        setState('loading');
        const res = await fetch('/api/admin/cuotas?limit=100');

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const rows = (data.data ?? []) as CuotaAdmin[];

        if (cancelled) return;

        setCuotas(rows);

        if (rows.length === 0) {
          setState('empty');
        } else {
          const pendientes = rows.filter((c) => c.estado === 'pendiente');
          if (pendientes.length === 0) {
            setState('no-pending');
          } else {
            setState('list');
          }
        }
      } catch {
        if (!cancelled) {
          setErrorMsg(NETWORK_ERROR);
          setState('error');
        }
      }
    }

    fetchCuotas();
    return () => { cancelled = true; };
  }, []);

  // ------------------------------------------------------------------
  // Auto-dismiss success banner after 5 seconds
  // ------------------------------------------------------------------
  useEffect(() => {
    if (state !== 'success') return;

    const timer = setTimeout(() => {
      setActiveCuotaId(null);
      setShowManualInput(null);
      setManualTxHash('');
      setManualTxError(null);

      const pendientes = cuotas.filter((c) => c.estado === 'pendiente');
      setState(pendientes.length > 0 ? 'list' : 'no-pending');
    }, 5000);

    return () => clearTimeout(timer);
  }, [state, cuotas]);

  // ------------------------------------------------------------------
  // MetaMask payment handler
  // ------------------------------------------------------------------
  const handleMetaMaskPayment = useCallback(async (cuota: CuotaAdmin) => {
    setActiveCuotaId(cuota.id);
    setState('submitting');
    setErrorMsg(null);

    try {
      // 1. Check MetaMask availability
      const ethereum = (window as any).ethereum;

      if (!ethereum) {
        throw new Error('MetaMask no está instalado. Usa el campo manual.');
      }

      // 2. Request account access
      setState('connecting');
      const accounts: string[] = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No se pudo conectar con MetaMask');
      }

      const userAddress = accounts[0] as `0x${string}`;

      // 3. Create wallet client connected to MetaMask (red activa, NO hardcoded)
      const activeChain = getActiveChain();
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(ethereum),
      });

      // 4. Switch to the active Celo network if not already on it
      try {
        await walletClient.switchChain({ id: activeChain.id });
      } catch (switchError: any) {
        // 4902 = chain not added to MetaMask
        if (switchError.code === 4902) {
          await walletClient.addChain({ chain: activeChain });
        } else {
          throw switchError;
        }
      }

      // 5-6. Ejecutar el pago según el modo del crédito
      const copmAddress = getCopmContractAddress();
      // CRITICAL: monto_cuota is in COPm (decimal), must convert to wei (10^18)
      // before sending to the ERC-20 contract via MetaMask.
      const amountWei = parseTokenAmount(cuota.monto_cuota) as bigint;
      let txHash: `0x${string}`;

      setState('submitting');

      if (cuota.repayment_mode === 'pool') {
        // Pool: approve(pool, amount) → repay(creditId, amount)  (2 transacciones)
        const poolAddress = getLendingPoolAddress();
        const creditId = creditIdHash(cuota.credito_id);
        const publicClient = createPublicClient({ chain: activeChain, transport: http() });

        // 5a. Aprobar solo si el allowance actual no alcanza. Evita una tx
        //     innecesaria cuando ya hay permiso suficiente.
        const currentAllowance = (await publicClient.readContract({
          address: copmAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [userAddress, poolAddress],
        })) as bigint;

        if (currentAllowance < amountWei) {
          const approveTx = await walletClient.writeContract({
            address: copmAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [poolAddress, amountWei],
            account: userAddress,
          });

          // waitForTransactionReceipt NO lanza si la tx revirtió: devuelve el
          // recibo con status 'reverted'. Hay que verificarlo explícitamente.
          const approveReceipt = await publicClient.waitForTransactionReceipt({
            hash: approveTx,
            timeout: 60_000,
          });
          if (approveReceipt.status !== 'success') {
            throw new Error('La aprobación de COPm falló en la blockchain. Reintenta el pago.');
          }

          // Esperar a que el allowance sea visible on-chain ANTES del repay,
          // para que la simulación de la wallet no lo tumbe (race fix).
          await waitForAllowance(publicClient, copmAddress, userAddress, poolAddress, amountWei);
        }

        txHash = await walletClient.writeContract({
          address: poolAddress,
          abi: LENDING_POOL_ABI,
          functionName: 'repay',
          args: [creditId, amountWei],
          account: userAddress,
        });
      } else {
        // Legacy: transfer directo a la platform wallet (1 transacción)
        const platformWallet = getPlatformWalletAddressPublic();
        txHash = await walletClient.writeContract({
          address: copmAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [platformWallet, amountWei],
          account: userAddress,
        });
      }

      // 7. Register payment in the backend
      const res = await fetch('/api/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuota_id: cuota.id,
          tx_hash: txHash,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorCode = data.error as string;
        const userMessage = data.detail ?? ERROR_MESSAGES[errorCode] ?? 'Error inesperado';
        throw new Error(userMessage);
      }

      // Success
      setCuotas((prev) =>
        prev.map((c) =>
          c.id === cuota.id
            ? { ...c, estado: 'pagada' as const, tx_hash_pago: txHash, fecha_pago: new Date().toISOString() }
            : c,
        ),
      );
      setActiveCuotaId(null);
      setState('success');
    } catch (err: any) {
      // Handle MetaMask rejection gracefully
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setErrorMsg('Transacción rechazada en MetaMask');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      }
      setActiveCuotaId(null);
      setState('error');
    }
  }, []);

  // ------------------------------------------------------------------
  // Manual tx_hash fallback
  // ------------------------------------------------------------------
  const validateTxHash = useCallback((hash: string): string | null => {
    if (!hash.startsWith('0x')) return 'El hash debe comenzar con 0x';
    if (hash.length !== 66) return 'El hash debe ser un hex válido de 64 caracteres';
    if (!TX_HASH_REGEX.test(hash)) return 'El hash contiene caracteres no válidos';
    return null;
  }, []);

  const handleManualSubmit = useCallback(async (cuota: CuotaAdmin) => {
    const validationError = validateTxHash(manualTxHash);
    if (validationError) {
      setManualTxError(validationError);
      return;
    }

    setActiveCuotaId(cuota.id);
    setState('submitting');
    setErrorMsg(null);

    try {
      const res = await fetch('/api/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuota_id: cuota.id,
          tx_hash: manualTxHash,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorCode = data.error as string;
        const userMessage = ERROR_MESSAGES[errorCode] ?? data.detail ?? 'Error inesperado';
        throw new Error(userMessage);
      }

      // Success
      setCuotas((prev) =>
        prev.map((c) =>
          c.id === cuota.id
            ? { ...c, estado: 'pagada' as const, tx_hash_pago: manualTxHash, fecha_pago: new Date().toISOString() }
            : c,
        ),
      );
      setShowManualInput(null);
      setManualTxHash('');
      setManualTxError(null);
      setActiveCuotaId(null);
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
      setActiveCuotaId(null);
      setState('error');
    }
  }, [manualTxHash, validateTxHash]);

  const handleRetry = useCallback(() => {
    const pendientes = cuotas.filter((c) => c.estado === 'pendiente');
    setState(pendientes.length > 0 ? 'list' : 'no-pending');
    setErrorMsg(null);
    setActiveCuotaId(null);
  }, [cuotas]);

  // ==========================================================================
  // Render: loading
  // ==========================================================================
  if (state === 'loading') {
    return <LoadingSkeleton variant="table" />;
  }

  // ==========================================================================
  // Render: empty
  // ==========================================================================
  if (state === 'empty') {
    return (
      <EmptyState
        title="Sin cuotas registradas"
        description="No tienes cuotas registradas en la plataforma."
        icon={
          <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    );
  }

  // ==========================================================================
  // Render: no-pending
  // ==========================================================================
  if (state === 'no-pending') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-200">Cuotas al día</p>
          </div>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-gray-400">No tenés cuotas pendientes.</p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Todas tus cuotas están al día.</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: success banner
  // ==========================================================================
  if (state === 'success') {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4" role="alert">
        <div className="flex items-start">
          <svg className="h-5 w-5 text-green-500 mt-0.5 mr-3 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-green-800 dark:text-green-200 font-medium">Pago registrado exitosamente</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: error banner
  // ==========================================================================
  if (state === 'error') {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4" role="alert">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-red-500 mt-0.5 mr-3 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-red-800 dark:text-red-200 font-medium">Error al registrar el pago</p>
              {errorMsg && <p className="text-red-600 dark:text-red-300 text-sm mt-1">{errorMsg}</p>}
            </div>
          </div>
        </div>
        <button onClick={handleRetry} className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500">
          <svg className="h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Reintentar
        </button>
      </div>
    );
  }

  // ==========================================================================
  // Render: list (and submitting/connecting overlays)
  // ==========================================================================

  const pendientes = cuotas.filter((c) => c.estado === 'pendiente');

  if (pendientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-lg">No tienes pagos pendientes</p>
      </div>
    );
  }

  // Group cuotas by credito_id for visual grouping
  const groupedByCredit = pendientes.reduce<Record<string, CuotaAdmin[]>>((acc, c) => {
    if (!acc[c.credito_id]) acc[c.credito_id] = [];
    acc[c.credito_id]!.push(c);
    return acc;
  }, {});

  const isSubmitting = state === 'submitting' || state === 'connecting';

  return (
    <div className="space-y-8">
      {Object.entries(groupedByCredit).map(([creditoId, creditCuotas]) => {
        const first = creditCuotas[0]!;

        return (
          <div
            key={creditoId}
            className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-100/40 dark:shadow-black/20"
          >
            {/* Credit header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-200">
                  {first.prestatario_nombre}
                </p>
                <p className="text-xs text-slate-400">
                  {first.total_cuotas} cuota{first.total_cuotas !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Cuotas table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-gray-700" aria-label="Cuotas del crédito">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cuota</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Capital</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Interés</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vencimiento</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {creditCuotas.map((cuota) => {
                    const isActive = activeCuotaId === cuota.id;
                    const isManualOpen = showManualInput === cuota.id;

                    return (
                      <tr key={cuota.id} className="transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-gray-200">
                          {cuota.numero_cuota}
                        </td>
                        {/* Cuota: COPm (directo, sin conversión) */}
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="font-mono text-sm font-semibold text-slate-800 dark:text-gray-200">
                            {formatCop(cuota.monto_cuota)} COPm
                          </div>
                        </td>
                        {/* Capital: COPm */}
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="font-mono text-sm font-medium text-slate-600 dark:text-gray-300">
                            {formatCop(cuota.monto_capital)} COPm
                          </div>
                        </td>
                        {/* Interés: COPm */}
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="font-mono text-sm font-medium text-slate-600 dark:text-gray-300">
                            {formatCop(cuota.monto_interes)} COPm
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-slate-500 dark:text-gray-400">
                          {new Date(cuota.fecha_vencimiento).toLocaleDateString('es-CO', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            cuota.estado === 'pagada'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : cuota.estado === 'vencida'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            {cuota.estado === 'pagada' ? 'Pagada' : cuota.estado === 'vencida' ? 'Vencida' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {cuota.estado === 'pagada' ? (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Pagada</span>
                          ) : isSubmitting && isActive ? (
                            <span className="inline-flex items-center text-xs text-gray-500 dark:text-gray-400">
                              <svg className="animate-spin h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Procesando…
                            </span>
                          ) : isManualOpen ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={manualTxHash}
                                  onChange={(e) => { setManualTxHash(e.target.value); setManualTxError(null); }}
                                  placeholder="0x..."
                                  disabled={isSubmitting}
                                  className={`block w-48 px-2 py-1.5 text-xs border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed ${
                                    manualTxError
                                      ? 'border-red-300 dark:border-red-600'
                                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                  }`}
                                  aria-label="Hash de transacción"
                                />
                                <button
                                  onClick={() => handleManualSubmit(cuota)}
                                  disabled={isSubmitting || !manualTxHash.trim()}
                                  className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => { setShowManualInput(null); setManualTxHash(''); setManualTxError(null); }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-all duration-150 cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                              {manualTxError && (
                                <p className="text-xs text-red-600 dark:text-red-400" role="alert">{manualTxError}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleMetaMaskPayment(cuota)}
                                disabled={isSubmitting}
                                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                                aria-label={`Pagar cuota ${cuota.numero_cuota}`}
                              >
                                <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 35 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                  <rect width="35" height="32" rx="4" fill="#F6851B"/>
                                  <path d="M27.538 16.333l-9.415 12.678L8.708 16.333l9.415-6.867 9.415 6.867z" fill="white" fillOpacity="0.6"/>
                                  <path d="M18.123 9.466L8.708 16.333l9.415 6.867 9.415-6.867-9.415-6.867z" fill="white"/>
                                </svg>
                                MetaMask
                              </button>
                              <button
                                onClick={() => setShowManualInput(cuota.id)}
                                disabled={isSubmitting}
                                className="inline-flex items-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-all duration-150 cursor-pointer"
                                title="Ingresar hash manualmente"
                              >
                                Manual
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend for paid cuotas (always show all cuotas) */}
            {cuotas
              .filter((c) => c.credito_id === creditoId && c.estado === 'pagada')
              .length > 0 && (
              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/30 border-t border-slate-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {cuotas.filter((c) => c.credito_id === creditoId && c.estado === 'pagada').length} de {first?.total_cuotas ?? 1} cuota{(first?.total_cuotas ?? 1) !== 1 ? 's' : ''} pagada{(first?.total_cuotas ?? 1) !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
