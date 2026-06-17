// =============================================================================
// Chequeo de balances en Celo MAINNET — wallet de plataforma (FLD)
// -----------------------------------------------------------------------------
// Corre apenas llegue el USDC para confirmar antes de swapear/fondear:
//   node scripts/check-balances-mainnet.mjs
// (No usa .env: direcciones de mainnet hardcodeadas y verificadas.)
// =============================================================================
import { createPublicClient, http, parseAbi, formatUnits, getAddress } from 'viem';
import { celo } from 'viem/chains';

const WALLET = getAddress('0x6C84eeaB621A521484D51Bc82d9E58a65336fc53');
const RPC = 'https://forno.celo.org';

// Direcciones de Celo Mainnet (verificadas)
const TOKENS = {
  'USDC':  '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', // 6 decimales
  'USDm':  '0x765DE816845861e75A25fCA122bb6898B8B1282a', // 18 decimales
  'COPm':  '0x8A567e2aE79CA692Bd748aB832081C45de4041eA', // 18 decimales (oficial Mento)
};

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

const client = createPublicClient({ chain: celo, transport: http(RPC) });

console.log('Red    : Celo Mainnet (42220)');
console.log('Wallet :', WALLET);
console.log('---');

const native = await client.getBalance({ address: WALLET });
console.log(`CELO (gas)              : ${formatUnits(native, 18)}`);

for (const [name, addr] of Object.entries(TOKENS)) {
  try {
    const a = getAddress(addr);
    const [bal, dec] = await Promise.all([
      client.readContract({ address: a, abi: erc20, functionName: 'balanceOf', args: [WALLET] }),
      client.readContract({ address: a, abi: erc20, functionName: 'decimals' }),
    ]);
    console.log(`${name.padEnd(23)}: ${formatUnits(bal, dec)}`);
  } catch (e) {
    console.log(`${name.padEnd(23)}: ERROR (${e.shortMessage || e.message})`);
  }
}
