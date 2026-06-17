// =============================================================================
// Chequeo de salud del oráculo COPm/USDm en Mento — Celo Sepolia
// -----------------------------------------------------------------------------
// El COPm oficial (0x5F8d...) sólo se puede swapear si su pool tiene un median
// de precio válido en SortedOracles. Hoy revierte con "no valid median".
// Este script te dice si YA revivió. Úsalo antes de correr el swap.
//
//   node scripts/check-copm-oracle.mjs
//   → exit 0 = oráculo VIVO (puedes swapear)   exit 1 = aún muerto
// =============================================================================
import { formatUnits, parseUnits, getAddress } from 'viem';
import { config } from 'dotenv';
import { createRequire } from 'module';
config({ path: '.env.local' });
const require = createRequire(import.meta.url);
const { Mento } = require('@mento-protocol/mento-sdk');

const COPM = getAddress('0x5F8d55c3627d2dc0a2B4afa798f877242F382F67');
const mento = await Mento.create(11142220, process.env.CELO_RPC_URL);
const stables = await mento.tokens.getStableTokens();
const USDM = getAddress(stables.find(t => t.symbol === 'USDm').address);

try {
  const route = await mento.routes.findRoute(USDM, COPM);
  const out = await mento.quotes.getAmountOut(USDM, COPM, parseUnits('1', 18), route);
  console.log(`✅ ORÁCULO VIVO — 1 USDm ≈ ${formatUnits(out, 18)} COPm`);
  console.log('   Ya puedes correr: node scripts/swap-usdm-to-copm.mjs');
  process.exit(0);
} catch (e) {
  const reason = (e.shortMessage || e.message || '').split('\n')[0];
  console.log(`❌ ORÁCULO AÚN MUERTO — ${reason}`);
  console.log('   Vuelve a intentar más tarde. No depende de tu código.');
  process.exit(1);
}
