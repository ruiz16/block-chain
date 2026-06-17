import { config } from 'dotenv';
import { createRequire } from 'module';
config({ path: '.env.local' });
const require = createRequire(import.meta.url);
const { Mento } = require('@mento-protocol/mento-sdk');

const mento = await Mento.create(11142220, process.env.CELO_RPC_URL);
const routes = await mento.routes.getDirectRoutes();
console.log(`Pools directas: ${routes.length}\n`);

const has = (r, s) => r.tokens.some(t => t.symbol === s);
const line = r => r.tokens.map(t => t.symbol).join(' <-> ');

console.log('--- Pools con COPm ---');
routes.filter(r => has(r, 'COPm')).forEach(r => console.log('  ', line(r)));
console.log('\n--- Pools con CELO ---');
routes.filter(r => has(r, 'CELO')).forEach(r => console.log('  ', line(r)));
console.log('\n--- TODAS ---');
routes.forEach(r => console.log('  ', line(r)));
