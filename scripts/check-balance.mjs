// Verify MockCusd balance on Celo Sepolia
import { createPublicClient, http, parseAbi } from 'viem';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
config({ path: '.env.local' });

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(process.env.CELO_RPC_URL ?? 'https://forno.celo-sepolia.celo-testnet.org'),
});

const contract = '0xb42aD227800bf1082A766Af8D2D221f43aE1e710';
const wallet = '0xfDF7e81A976E3c4079DA45e39f7014A4e27445f4';

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
