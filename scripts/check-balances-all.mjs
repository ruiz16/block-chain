// Check all relevant balances on the platform wallet — Celo Sepolia
import { createPublicClient, http, parseAbi, formatUnits, getAddress } from 'viem';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
config({ path: '.env.local' });

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(process.env.CELO_RPC_URL),
});

const wallet = getAddress(process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS.trim());

// Sepolia testnet token addresses (from celopedia contracts.md → Testnet Tokens)
const TOKENS = {
  'USDm (Sepolia)': '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80',
  'USDC (Sepolia)': '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
  'COPm (Sepolia oficial)': '0x5F8d55c3627d2dc0a2B4afa798f877242F382F67',
};

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

console.log('Wallet:', wallet);
console.log('RPC   :', process.env.CELO_RPC_URL ? 'ok' : 'FALTA CELO_RPC_URL');
console.log('---');

const native = await client.getBalance({ address: wallet });
console.log(`CELO (nativo) : ${formatUnits(native, 18)}`);

for (const [name, addr] of Object.entries(TOKENS)) {
  try {
    const a = getAddress(addr);
    const [bal, dec] = await Promise.all([
      client.readContract({ address: a, abi: erc20, functionName: 'balanceOf', args: [wallet] }),
      client.readContract({ address: a, abi: erc20, functionName: 'decimals' }),
    ]);
    console.log(`${name.padEnd(24)}: ${formatUnits(bal, dec)}`);
  } catch (e) {
    console.log(`${name.padEnd(24)}: ERROR (${e.shortMessage || e.message})`);
  }
}
