import { createPublicClient, createWalletClient, http, parseAbi, getAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const rpc = process.env.CELO_RPC_URL;
  const account = privateKeyToAccount(`0x${process.env.CELO_PRIVATE_KEY.replace('0x', '')}`);
  
  const publicClient = createPublicClient({ chain: celoSepolia, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http(rpc) });

  const target = getAddress("0x6C84eeaB621A521484D51Bc82d9E58a65336fc53");
  const CUSD = '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1'; 
  
  const amount = parseUnits("0.5", 18);

  const erc20 = parseAbi([
    'function transfer(address, uint256) returns (bool)',
  ]);

  console.log(`Sending 0.5 cUSD to ${target}...`);
  
  // Vamos a pagarlo en CELO nativo (ya tienes CELO de sobra), no feeCurrency.
  // El error de "unregistered fee-currency address" significa que la red RPC no 
  // reconoce esta address especifica como permitida para feeCurrency en Sepolia en el request eth_gasPrice
  const hash = await walletClient.writeContract({
    address: CUSD,
    abi: erc20,
    functionName: 'transfer',
    args: [target, amount],
    chain: celoSepolia
  });
  
  console.log('Transaction hash:', hash);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Done!');
}
main().catch(console.error);
