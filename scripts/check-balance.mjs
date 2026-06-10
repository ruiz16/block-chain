// Verify MockCopm balance on Celo Sepolia
import { createPublicClient, http, parseAbi } from 'viem';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
config({ path: '.env.local' });

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(process.env.CELO_RPC_URL ?? 'https://forno.celo-sepolia.celo-testnet.org'),
});

const contract = process.env.NEXT_PUBLIC_COPM_CONTRACT;
if (!contract) throw new Error('Falta NEXT_PUBLIC_COPM_CONTRACT en .env.local');

const wallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS;
if (!wallet) throw new Error('Falta NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS en .env.local');

const [balance, symbol, decimals] = await Promise.all([
  client.readContract({
    address: contract,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [wallet],
  }),
  client.readContract({
    address: contract,
    abi: parseAbi(['function symbol() view returns (string)']),
    functionName: 'symbol',
  }),
  client.readContract({
    address: contract,
    abi: parseAbi(['function decimals() view returns (uint8)']),
    functionName: 'decimals',
  }),
]);

console.log(`Balance: ${Number(balance) / 10 ** Number(decimals)} ${symbol}`);
