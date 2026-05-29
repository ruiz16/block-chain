'use client';

// =============================================================================
// WalletConnectButton — Connect Ethereum Wallet (MetaMask / Celo Wallet)
// =============================================================================
//
// Detects window.ethereum, requests accounts, and passes the address to the
// parent form via the onAddressChange callback.
//
// States:
//   no-wallet     — window.ethereum not detected — disabled button
//   idle          — "Conectar Wallet" button
//   connecting    — Spinner while requesting accounts
//   connected     — Truncated address with green dot
//   error         — User rejected or connection error
// =============================================================================

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// EIP-1193 Ethereum Provider type declaration
// =============================================================================

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface WalletConnectButtonProps {
  onAddressChange: (address: string) => void;
}

type WalletState = 'no-wallet' | 'idle' | 'connecting' | 'connected' | 'error';

export default function WalletConnectButton({
  onAddressChange,
}: WalletConnectButtonProps) {
  const [walletState, setWalletState] = useState<WalletState>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ------------------------------------------------------------------------
  // Detect wallet on mount
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.ethereum) {
      Promise.resolve().then(() => setWalletState('no-wallet'));
    }
  }, []);

  // ------------------------------------------------------------------------
  // Listen for account changes
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        // User disconnected
        setAddress(null);
        setWalletState('idle');
        onAddressChange('');
      } else {
        const newAddress = accs[0] as string;
        setAddress(newAddress);
        setWalletState('connected');
        onAddressChange(newAddress);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [onAddressChange]);

  // ------------------------------------------------------------------------
  // Connect handler
  // ------------------------------------------------------------------------
  const handleConnect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setWalletState('no-wallet');
      return;
    }

    setWalletState('connecting');
    setErrorMsg(null);

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (accounts.length === 0) {
        setErrorMsg('No se obtuvieron cuentas de la wallet');
        setWalletState('error');
        return;
      }

      const connectedAddress = accounts[0] as string;
      setAddress(connectedAddress);
      setWalletState('connected');
      onAddressChange(connectedAddress);
    } catch (err) {
      const error = err as { code?: number; message?: string };

      if (error.code === 4001) {
        // User rejected the request
        setErrorMsg('Conexión rechazada');
      } else {
        setErrorMsg(error.message ?? 'Error al conectar la wallet');
      }

      setWalletState('error');
    }
  }, [onAddressChange]);

  // ------------------------------------------------------------------------
  // Format address for display: 0x1234...5678
  // ------------------------------------------------------------------------
  const truncateAddress = (addr: string): string => {
    if (addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // ------------------------------------------------------------------------
  // Render state: no wallet detected
  // ------------------------------------------------------------------------
  if (walletState === 'no-wallet') {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-xs font-medium text-gray-400 bg-gray-100 cursor-not-allowed"
        title="No se detectó una wallet como MetaMask"
        aria-label="No hay wallet detectada"
      >
        <svg
          className="h-3.5 w-3.5 mr-1.5"
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
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        No hay wallet detectada
      </button>
    );
  }

  // ------------------------------------------------------------------------
  // Render state: connected
  // ------------------------------------------------------------------------
  if (walletState === 'connected' && address) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-3 py-2 border border-green-300 rounded-md text-xs font-medium text-green-700 bg-green-50"
        title={`Conectado: ${address}`}
      >
        <span
          className="h-2 w-2 rounded-full bg-green-500"
          aria-hidden="true"
        />
        {truncateAddress(address)}
        <span className="text-green-500 ml-0.5">Conectado</span>
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Render state: connecting
  // ------------------------------------------------------------------------
  if (walletState === 'connecting') {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-xs font-medium text-gray-500 bg-white cursor-not-allowed"
      >
        <svg
          className="animate-spin h-3.5 w-3.5 mr-1.5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Conectando…
      </button>
    );
  }

  // ------------------------------------------------------------------------
  // Render state: error
  // ------------------------------------------------------------------------
  if (walletState === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={handleConnect}
          className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
        >
          <svg
            className="h-3.5 w-3.5 mr-1.5"
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
        {errorMsg && (
          <p className="text-xs text-red-500">{errorMsg}</p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Render state: idle — default
  // ------------------------------------------------------------------------
  return (
    <button
      type="button"
      onClick={handleConnect}
      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
      aria-label="Conectar wallet"
    >
      <svg
        className="h-3.5 w-3.5 mr-1.5"
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
      Conectar Wallet
    </button>
  );
}
