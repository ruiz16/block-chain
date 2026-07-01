import hre from 'hardhat';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// Upsert seguro de una env var en un .env.local. SIEMPRE hace backup primero.
// - Si la clave existe, reemplaza solo esa línea. Si no, la agrega al final.
// - No toca ninguna otra variable.
function writeEnv(filePath, key, value, label) {
  if (!existsSync(filePath)) {
    console.log(`  ⚠️ ${label}: no encontré ${filePath}`);
    console.log(`     Seteá manualmente: ${key}=${value}`);
    return;
  }
  const raw = readFileSync(filePath, 'utf8');

  // 1. BACKUP timestamped ANTES de tocar nada.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${filePath}.bak-${ts}`;
  copyFileSync(filePath, backup);

  // 2. Upsert preservando el resto del archivo (y el estilo de fin de línea).
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const re = new RegExp(`^\\s*${key}\\s*=`);
  let found = false;
  let oldLine = null;
  const out = lines.map((l) => {
    if (re.test(l)) { found = true; oldLine = l; return `${key}=${value}`; }
    return l;
  });
  if (!found) {
    if (out.length && out[out.length - 1].trim() === '') out[out.length - 1] = `${key}=${value}`;
    else out.push(`${key}=${value}`);
  }
  writeFileSync(filePath, out.join(eol));

  console.log(`  ✅ ${label}: ${filePath}`);
  console.log(`     backup → ${backup}`);
  if (found) console.log(`     ${oldLine.trim()}  →  ${key}=${value}`);
  else console.log(`     + ${key}=${value} (agregada)`);
}

// =============================================================================
// 💥 DEPLOY AND BOOM — Despliega LendingPool v2 + lo fondea en UN comando.
// -----------------------------------------------------------------------------
// Encadena: deploy → fund → escribe la dirección del pool en los .env.local
// (backend + móvil), haciendo BACKUP timestamped de cada uno antes de tocarlo.
// Evita el baile manual (deploy → copiar address → setear env → fund).
//
//   TESTNET (default):
//     FUND_AMOUNT=10000 npx hardhat run scripts/ops/deploy-and-fund.mjs --network celoSepolia
//   MAINNET (plata real — confirmá montos):
//     FUND_AMOUNT=25000 npx hardhat run scripts/ops/deploy-and-fund.mjs --network celo
//
// Para piloto: owner = disburser = treasury = la wallet deployer.
// =============================================================================

const KNOWN_MAINNET_COPM = '0x8A567e2aE79CA692Bd748aB832081C45de4041eA';

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

async function main() {
  const isMainnet = hre.network.name === 'celo';
  const [deployer] = await hre.ethers.getSigners();

  // --- Resolver COPm (network-aware) ---
  const copmEnvVar = isMainnet ? 'NEXT_PUBLIC_COPM_CONTRACT_MAINNET' : 'NEXT_PUBLIC_COPM_CONTRACT';
  const copmEnv = process.env[copmEnvVar] ?? (isMainnet ? KNOWN_MAINNET_COPM : undefined);
  if (!copmEnv) throw new Error(`❌ Falta ${copmEnvVar} en .env.local`);
  const copm = hre.ethers.getAddress(copmEnv.trim());

  // .trim() defensivo: en PowerShell/CMD es fácil que se cuele un espacio final.
  const fundRaw = process.env.FUND_AMOUNT?.trim();
  const fundHuman = fundRaw || (isMainnet ? null : '10000');
  if (!fundHuman) throw new Error('❌ En mainnet definí FUND_AMOUNT explícitamente (ej. FUND_AMOUNT=25000).');
  const fundWei = hre.ethers.parseUnits(String(fundHuman), 18);
  const maxDisbursement = hre.ethers.parseUnits('1000000', 18);

  console.log('==================================================');
  console.log(`💥 DEPLOY AND BOOM — red: ${hre.network.name}${isMainnet ? ' (MAINNET ⚠️)' : ''}`);
  console.log(`Deployer (owner/disburser/treasury): ${deployer.address}`);
  console.log(`COPm (${copmEnvVar}): ${copm}`);
  console.log(`Fondeo inicial: ${fundHuman} COPm`);
  console.log('==================================================\n');

  // --- 1. Deploy ---
  console.log('⏳ [1/3] Desplegando LendingPool v2...');
  const Factory = await hre.ethers.getContractFactory('LendingPool');
  const pool = await Factory.deploy(
    copm,
    deployer.address, // owner
    deployer.address, // disburser
    deployer.address, // treasury
    maxDisbursement,
  );
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log(`✅ Desplegado: ${poolAddress}\n`);

  // --- 2. Verificar saldo y fondear ---
  console.log('⏳ [2/3] Fondeando el pool...');
  const token = new hre.ethers.Contract(copm, ERC20_ABI, deployer);
  const bal = await token.balanceOf(deployer.address);
  if (bal < fundWei) {
    console.error(`❌ Saldo COPm insuficiente para fondear: tenés ${hre.ethers.formatUnits(bal, 18)}, necesitás ${fundHuman}.`);
    console.error(`   El contrato YA se desplegó en ${poolAddress}. Fondealo aparte cuando tengas COPm:`);
    console.error(`   FUND_AMOUNT=<monto> npx hardhat run scripts/ops/fund-lending-pool.mjs --network ${hre.network.name}`);
    process.exit(1);
  }
  const approveTx = await token.approve(poolAddress, fundWei);
  await approveTx.wait();
  const fundTx = await pool.fund(fundWei);
  await fundTx.wait();
  console.log(`✅ Fondeado con ${fundHuman} COPm\n`);

  // --- 3. Backup + auto-write env vars (upsert seguro en ambos .env.local) ---
  const suf = isMainnet ? '_MAINNET' : '';
  const viteSuf = isMainnet ? '_MAINNET' : '_SEPOLIA';
  const backendKey = `NEXT_PUBLIC_LENDING_POOL_CONTRACT${suf}`;
  const mobileKey = `VITE_LENDING_POOL${viteSuf}`;

  // cwd = mangle-app (hardhat corre desde ahí). mangle-mobile es hermano.
  const backendEnv = resolve(process.cwd(), '.env.local');
  const mobileEnv = resolve(process.cwd(), '../mangle-mobile/.env.local');

  console.log('==================================================');
  console.log('🎯 [3/3] BOOM. Actualizando .env.local (backup primero):\n');
  writeEnv(backendEnv, backendKey, poolAddress, 'backend');
  writeEnv(mobileEnv, mobileKey, poolAddress, 'móvil');

  console.log('\n⚠️ Backend y móvil quedaron con la MISMA dirección del pool.');
  console.log('   Reiniciá el backend (y rebuild del móvil si aplica) para tomar el ABI v2.');
  console.log('   Si algo salió mal, restaurá desde el archivo .bak-<timestamp> que se creó.');
  console.log('==================================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error en deploy-and-fund:\n', error);
    process.exit(1);
  });
