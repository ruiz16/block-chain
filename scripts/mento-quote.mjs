// Quote USDm -> COPm on Mento (Celo Sepolia)
import { formatUnits, parseUnits, getAddress } from 'viem';
import { config } from 'dotenv';
import { createRequire } from 'module';
config({ path: '.env.local' });
const require = createRequire(import.meta.url);
const { Mento } = require('@mento-protocol/mento-sdk');

const COPM = getAddress('0x5F8d55c3627d2dc0a2B4afa798f877242F382F67');
const mento = await Mento.create(11142220, process.env.CELO_RPC_URL);

const stables = await mento.tokens.getStableTokens();
const usdm = stables.find(t => t.symbol === 'USDm');
const USDM = getAddress(usdm.address);
console.log('USDm (Mento Sepolia):', USDM);
console.log('COPm:', COPM);

const route = await mento.routes.findRoute(USDM, COPM);
console.log('Ruta:', route.tokens.map(t => t.symbol).join(' -> '), `(${route.path.length} hop)`);

for (const amt of ['1', '10', '100']) {
  const out = await mento.quotes.getAmountOut(USDM, COPM, parseUnits(amt, 18), route);
  console.log(`💱 ${amt} USDm ≈ ${formatUnits(out, 18)} COPm`);
}
