import { formatUnits, parseUnits, getAddress } from 'viem';
import { config } from 'dotenv';
import { createRequire } from 'module';
config({ path: '.env.local' });
const require = createRequire(import.meta.url);
const { Mento } = require('@mento-protocol/mento-sdk');

const mento = await Mento.create(11142220, process.env.CELO_RPC_URL);
const stables = await mento.tokens.getStableTokens();
const coll = await mento.tokens.getCollateralAssets();
const addr = s => getAddress((stables.find(t=>t.symbol===s)||coll.find(t=>t.symbol===s)).address);

const tests = [
  ['USDC','USDm'], ['USDm','COPm'], ['USDm','EURm'], ['USDm','BRLm'], ['USDm','GBPm'],
];
for (const [a,b] of tests) {
  try {
    const r = await mento.routes.findRoute(addr(a), addr(b));
    const out = await mento.quotes.getAmountOut(addr(a), addr(b), parseUnits('1',18), r);
    console.log(`✅ 1 ${a} -> ${formatUnits(out,18)} ${b}`);
  } catch (e) {
    console.log(`❌ ${a} -> ${b}: ${e.shortMessage || e.message?.split('\n')[0]}`);
  }
}
