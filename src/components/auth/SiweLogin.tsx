'use client';

// =============================================================================
// SiweLogin — Sign-In with Ethereum (EIP-4361) Component
// =============================================================================
//
// 6-state component that manages the full SIWE authentication flow:
//
//   idle                  → Initial state — "Sign in with Celo Wallet" button
//   connecting            → Connecting to wallet (eth_requestAccounts)
//   awaiting_signature    → Waiting for user to sign in MetaMask/Celo wallet
//   verifying             → POST to /api/auth/siwe for verification
//   success               → Redirecting after successful auth
//   error                 → Error state with retry button
//
// On success:
//   - isNewUser=true  → redirect to /onboarding
//   - isNewUser=false → redirect to /aprobacion (or original redirect param)
//
// Dependencies:
//   - siwe (EIP-4361 message formatting)
//   - window.ethereum (EIP-1193 provider from MetaMask / Celo wallet)
// =============================================================================

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiweMessage } from 'siwe';
import { getAddress } from 'viem';
import { useAuth } from './AuthProvider';

// =============================================================================
// Types
// =============================================================================

type SiweState =
  | 'idle'
  | 'connecting'
  | 'awaiting_signature'
  | 'verifying'
  | 'success'
  | 'error';

interface SiweApiResponse {
  ok: boolean;
  isNewUser?: boolean;
  error?: string;
  detail?: string;
}

// =============================================================================
// Component
// =============================================================================

export default function SiweLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const redirectTo = searchParams?.get('redirect') ?? '/aprobacion';

  const [state, setState] = useState<SiweState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Main sign-in handler
  // --------------------------------------------------------------------------
  const handleSignIn = useCallback(async () => {
    // If already authenticated in Supabase, just redirect immediately
    if (isAuthenticated) {
      setState('success');
      router.push(redirectTo);
      return;
    }

    // Reset error
    setErrorMsg(null);

    // Guard: no Ethereum provider (e.g., MetaMask not installed)
    if (typeof window === 'undefined' || !window.ethereum) {
      setErrorMsg(
        'No se detectó una wallet compatible. Instala MetaMask o una wallet de Celo.',
      );
      setState('error');
      return;
    }

    setState('connecting');

    try {
      // ----------------------------------------------------------------------
      // Step 1: Connect wallet (request accounts)
      // ----------------------------------------------------------------------
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (accounts.length === 0) {
        throw Object.assign(new Error('No se obtuvieron cuentas de la wallet'), {
          code: 'NO_ACCOUNTS',
        });
      }

      const rawAddress = accounts[0] as string;

      // Normalize to EIP-55 checksummed format (MetaMask may return lowercase)
      const address = getAddress(rawAddress);

      // ----------------------------------------------------------------------
      // Step 2: Fetch nonce from server
      // ----------------------------------------------------------------------
      const nonceRes = await fetch(
        `/api/auth/nonce?wallet_address=${encodeURIComponent(address)}`,
      );

      if (!nonceRes.ok) {
        const nonceErr: { error?: string; detail?: string } =
          await nonceRes.json().catch(() => ({}));

        if (nonceRes.status === 429) {
          throw new Error(nonceErr.detail ?? 'Demasiadas solicitudes, espera unos minutos');
        }

        throw new Error(nonceErr.detail ?? 'Error al obtener nonce de seguridad');
      }

      const { nonce } = await nonceRes.json();

      if (!nonce) {
        throw new Error('No se recibió un nonce válido del servidor');
      }

      // ----------------------------------------------------------------------
      // Step 3: Create SIWE message
      // ----------------------------------------------------------------------
      setState('awaiting_signature');

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Inicia sesion en Block-Chain con tu wallet Celo',
        uri: window.location.origin,
        version: '1',
        chainId: 11142220,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const messageToSign = siweMessage.prepareMessage();

      // ----------------------------------------------------------------------
      // Step 4: Request signature from wallet (opens MetaMask popup)
      // ----------------------------------------------------------------------
      const signature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [messageToSign, address],
      })) as string;

      // ----------------------------------------------------------------------
      // Step 5: Verify signature with server
      // ----------------------------------------------------------------------
      setState('verifying');

      const verifyRes = await fetch('/api/auth/siwe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSign, signature }),
      });

      const verifyData: SiweApiResponse = await verifyRes.json();

      if (!verifyRes.ok || !verifyData.ok) {
        const detail = verifyData.detail ?? 'Error al verificar la firma';

        if (verifyRes.status === 401) {
          throw new Error(detail);
        }

        throw new Error(detail);
      }

      // ----------------------------------------------------------------------
      // Step 6: Success — redirect
      // ----------------------------------------------------------------------
      setState('success');

      // Small delay so the user sees the success state
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (verifyData.isNewUser) {
        router.push('/onboarding');
      } else {
        router.push(redirectTo);
      }
    } catch (err) {
      const error = err as { code?: number | string; message?: string };

      // Handle specific error codes
      if (error.code === 4001) {
        // User rejected the MetaMask signature request
        setErrorMsg('Firma rechazada');
      } else if (error.code === 'NO_ACCOUNTS') {
        setErrorMsg('No se pudieron obtener cuentas de la wallet');
      } else {
        console.error(error);
        setErrorMsg('Error al iniciar sesión con wallet');
      }

      setState('error');
    }
  }, [router, redirectTo, isAuthenticated]);

  // --------------------------------------------------------------------------
  // Reset handler
  // --------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setState('idle');
    setErrorMsg(null);
  }, []);

  // --------------------------------------------------------------------------
  // Render: connecting
  // --------------------------------------------------------------------------
  if (state === 'connecting') {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled
          className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
        >
          <svg
            className="animate-spin h-4 w-4 mr-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Conectando wallet…
        </button>
        <p className="text-xs text-gray-400">
          Abriendo MetaMask para conectar tu wallet
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: awaiting_signature
  // --------------------------------------------------------------------------
  if (state === 'awaiting_signature') {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled
          className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
        >
          <svg
            className="animate-spin h-4 w-4 mr-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Esperando firma…
        </button>
        <p className="text-xs text-gray-400">
          Revisa tu wallet para firmar el mensaje
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: verifying
  // --------------------------------------------------------------------------
  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          disabled
          className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-500 cursor-not-allowed"
        >
          <svg
            className="animate-spin h-4 w-4 mr-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Verificando firma…
        </button>
        <p className="text-xs text-gray-400">
          El servidor está verificando tu identidad
        </p>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: success
  // --------------------------------------------------------------------------
  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="w-full rounded-md border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-sm font-medium text-green-700">
            ¡Sesión iniciada! Redirigiendo…
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: error
  // --------------------------------------------------------------------------
  if (state === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3"
          role="alert"
        >
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSignIn}
            className="flex-1 inline-flex items-center justify-center rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
          >
            <svg
              className="h-4 w-4 mr-1.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reintentar
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: idle — default
  // --------------------------------------------------------------------------
  return (
    <button
      type="button"
      onClick={handleSignIn}
      className="w-full inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      aria-label="Iniciar sesión con wallet Celo"
    >
      <svg
        className="h-4 w-4 mr-2"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      Iniciar sesión con Celo Wallet
    </button>
  );
}
