// =============================================================================
// Swap USDm -> COPm (oficial Mento) — Celo Sepolia
// -----------------------------------------------------------------------------
// Usa el Mento SDK v3 (viem). Descubre broker/exchangeId/ruta solo.
// REQUISITOS:
//   - .env.local con CELO_PRIVATE_KEY y CELO_RPC_URL
//   - Tu wallet debe tener USDm de Mento Sepolia (0xdE9e4C...)
//   - El oráculo de COPm debe estar VIVO (corre antes: check-copm-oracle.mjs)
//
//   node scripts/swap-usdm-to-copm.mjs
// =============================================================================
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celoSepolia } from 'viem/chains';
import { config } from 'dotenv';
import { createRequire } from 'module';
config({ path: '.env.local' });
const require = createRequire(import.meta.url);
const { Mento, deadlineFromMinutes } = require('@mento-protocol/mento-sdk');

const COPM = getAddress('0x5F8d55c3627d2dc0a2B4afa798f877242F382F67');
const AMOUNT_USDM = '50';        // cuánto USDm gastar
const SLIPPAGE = 1.0;            // 1%

const pk = process.env.CELO_PRIVATE_KEY.startsWith('0x')
  ? process.env.CELO_PRIVATE_KEY
  : `0x${process.env.CELO_PRIVATE_KEY}`;
const account = privateKeyToAccount(pk);
const rpc = process.env.CELO_RPC_URL;

const publicClient = createPublicClient({ chain: celoSepolia, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http(rpc) });

const mento = await Mento.create(11142220, rpc);
const stables = await mento.tokens.getStableTokens();
const USDM = getAddress(stables.find(t => t.symbol === 'USDm').address);

console.log('Wallet :', account.address);
console.log('USDm   :', USDM);
console.log('COPm   :', COPM);

const amountIn = parseUnits(AMOUNT_USDM, 18);

// 1) Quote (falla si el oráculo está muerto)
let route, expected;
try {
  route = await mento.routes.findRoute(USDM, COPM);
  expected = await mento.quotes.getAmountOut(USDM, COPM, amountIn, route);
} catch (e) {
  console.error(`\n❌ No se puede cotizar COPm: ${(e.shortMessage || e.message).split('\n')[0]}`);
  console.error('   El oráculo de COPm sigue sin precio en Sepolia. Aborto sin gastar gas.');
  process.exit(1);
}
console.log(`\n💱 ${AMOUNT_USDM} USDm ≈ ${formatUnits(expected, 18)} COPm (slippage ${SLIPPAGE}%)`);

// 2) Construir tx (approval + swap)
const { approval, swap } = await mento.swap.buildSwapTransaction(
  USDM, COPM, amountIn, account.address, account.address,
  { slippageTolerance: SLIPPAGE, deadline: deadlineFromMinutes(10) },
  route,
);

if (approval) {
  console.log('\n⏳ Aprobando USDm al router de Mento...');
  const h = await walletClient.sendTransaction({ to: approval.to, data: approval.data, value: approval.value ?? 0n });
  await publicClient.waitForTransactionReceipt({ hash: h });
  console.log('✅ Approval:', h);
}

console.log('⏳ Ejecutando swap...');
const sh = await walletClient.sendTransaction({ to: swap.params.to, data: swap.params.data, value: swap.params.value ?? 0n });
const rec = await publicClient.waitForTransactionReceipt({ hash: sh });
console.log(`\n🎉 Swap OK (${rec.status})`);
console.log(`   Tx: https://celo-sepolia.blockscout.com/tx/${sh}`);
