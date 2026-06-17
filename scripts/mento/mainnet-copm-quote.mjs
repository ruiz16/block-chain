// ¿Cuánto USDC/USDm cuesta comprar 100.000 COPm en MAINNET? + ¿oráculo vivo?
import { formatUnits, parseUnits, getAddress } from 'viem';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Mento } = require('@mento-protocol/mento-sdk');

const RPC = 'https://forno.celo.org';
const COPM = getAddress('0x8A567e2aE79CA692Bd748aB832081C45de4041eA'); // COPm mainnet
const mento = await Mento.create(42220, RPC);

const stables = await mento.tokens.getStableTokens();
const coll = await mento.tokens.getCollateralAssets();
const find = s => (stables.find(t=>t.symbol===s)||coll.find(t=>t.symbol===s));
const USDM = getAddress(find('USDm').address);

console.log('COPm mainnet:', COPM);
console.log('USDm mainnet:', USDM);

const target = 100000; // COPm deseados
for (const [sym, addr, dec] of [['USDm', USDM, 18]]) {
  try {
    const r = await mento.routes.findRoute(addr, COPM);
    const out1 = await mento.quotes.getAmountOut(addr, COPM, parseUnits('1', dec), r);
    const perUnit = Number(formatUnits(out1, 18)); // COPm por 1 unidad de sym
    const needed = target / perUnit;
    console.log(`\n✅ ORÁCULO VIVO  (ruta ${r.tokens.map(t=>t.symbol).join('->')})`);
    console.log(`   1 ${sym} ≈ ${perUnit.toFixed(2)} COPm`);
    console.log(`   Para ${target.toLocaleString()} COPm necesitas ≈ ${needed.toFixed(2)} ${sym}`);
  } catch (e) {
    console.log(`\n❌ ${sym}->COPm: ${(e.shortMessage||e.message).split('\n')[0]}`);
  }
}
