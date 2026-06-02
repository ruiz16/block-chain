// =============================================================================
// Global Ethereum Provider (EIP-1193) Type Declaration
// =============================================================================
//
// Declares window.ethereum so that code like:
//
//   const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
//
// compiles without TS errors.
//
// Uses viem's EIP1193Provider which provides typed `request()` matching the
// EIP-1193 standard used by MetaMask, Celo Wallet, and other injected wallets.
// =============================================================================

import type { EIP1193Provider } from 'viem';

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}
