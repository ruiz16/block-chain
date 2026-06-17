import { createPublicClient, http, parseAbi, getAddress } from 'viem';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const client = createPublicClient({
    chain: celoSepolia,
    transport: http(process.env.CELO_RPC_URL),
  });

  const target = getAddress("0x6C84eeaB621A521484D51Bc82d9E58a65336fc53");

  const TOKENS = {
    'cUSD (El que te envie)': '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1',
  };

  const erc20 = parseAbi([
    'function balanceOf(address) view returns (uint256)',
  ]);

  const bal = await client.readContract({ address: TOKENS['cUSD (El que te envie)'], abi: erc20, functionName: 'balanceOf', args: [target] });
  console.log(`Balance de cUSD: ${Number(bal) / 1e18}`);
}
main().catch(console.error);
