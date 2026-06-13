// =============================================================================
// LendingPool ABI — mínimo para disburse / repay / lectura del evento Repaid
// =============================================================================

export const LENDING_POOL_ABI = [
  {
    type: 'function',
    name: 'disburse',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'creditId', type: 'bytes32' },
      { name: 'borrower', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'creditId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Repaid',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creditId', type: 'bytes32' },
      { indexed: true, name: 'payer', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'totalRepaid', type: 'uint256' },
    ],
  },
] as const;

/** keccak256("Repaid(bytes32,address,uint256,uint256)") — topic0 del evento */
export const REPAID_EVENT_SIGNATURE =
  '0x01e7ee7e76483485fd1d9e5b1c6a72af05e18dac7fc43f767d6897ef153bef86' as `0x${string}`;
