// =============================================================================
// ERC-20 Minimal ABI — for MetaMask transfer() calls
// =============================================================================
//
// Only includes the `transfer` function we need for payment.
// No need for the full ERC-20 ABI — keeps the bundle small.
// =============================================================================

export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;
