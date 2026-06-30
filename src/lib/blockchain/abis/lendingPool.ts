// =============================================================================
// LendingPool ABI (v2) — disburse / repay / sweepInterest / fund + eventos
// =============================================================================
// Sincronizado con contracts/LendingPool.sol v2:
//  - disburse(creditId, borrower, principal, interest, dueDate)
//  - repay(creditId, amount) returns (accepted)
//  - sweepInterest() returns (amount)   [reemplaza el viejo withdraw para el barrido]
//  - evento Repaid(creditId, payer, accepted, principalPart, interestPart, totalRepaid)
// =============================================================================

export const LENDING_POOL_ABI = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disburse',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'creditId', type: 'bytes32' },
      { name: 'borrower', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'interest', type: 'uint256' },
      { name: 'dueDate', type: 'uint64' },
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
    outputs: [{ name: 'accepted', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sweepInterest',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'markDefaulted',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'creditId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pendingInterest',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'availableLiquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'remainingDue',
    stateMutability: 'view',
    inputs: [{ name: 'creditId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Disbursed',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creditId', type: 'bytes32' },
      { indexed: true, name: 'borrower', type: 'address' },
      { indexed: false, name: 'principal', type: 'uint256' },
      { indexed: false, name: 'totalDue', type: 'uint256' },
      { indexed: false, name: 'dueDate', type: 'uint64' },
    ],
  },
  {
    type: 'event',
    name: 'Repaid',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'creditId', type: 'bytes32' },
      { indexed: true, name: 'payer', type: 'address' },
      { indexed: false, name: 'accepted', type: 'uint256' },
      { indexed: false, name: 'principalPart', type: 'uint256' },
      { indexed: false, name: 'interestPart', type: 'uint256' },
      { indexed: false, name: 'totalRepaid', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'CreditFullyRepaid',
    anonymous: false,
    inputs: [{ indexed: true, name: 'creditId', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'InterestSwept',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  // Errores custom (para que viem decodifique reverts en simulateContract)
  { type: 'error', name: 'NotDisburser', inputs: [] },
  { type: 'error', name: 'CreditAlreadyExists', inputs: [] },
  { type: 'error', name: 'CreditNotFound', inputs: [] },
  { type: 'error', name: 'CreditAlreadyRepaid', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'AmountExceedsCap', inputs: [] },
  { type: 'error', name: 'InsufficientLiquidity', inputs: [] },
  { type: 'error', name: 'NothingToSweep', inputs: [] },
  { type: 'error', name: 'InvalidLoanTerms', inputs: [] },
] as const;

/** keccak256("Repaid(bytes32,address,uint256,uint256,uint256,uint256)") — topic0 v2 */
export const REPAID_EVENT_SIGNATURE =
  '0xaa28c4652d4b3d47b4f1987a0647ccf2b36cbba5468761b6520b20e4c501c198' as `0x${string}`;
