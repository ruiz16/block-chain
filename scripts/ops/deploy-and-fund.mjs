import hre from 'hardhat';

// =============================================================================
// 💥 DEPLOY AND BOOM — Despliega LendingPool v2 + lo fondea en UN comando.
// -----------------------------------------------------------------------------
// Encadena: deploy → fund → imprime las env vars listas para pegar.
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

  const fundHuman = process.env.FUND_AMOUNT ?? (isMainnet ? null : '10000');
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

  // --- 3. Imprimir env vars listas para pegar ---
  const suf = isMainnet ? '_MAINNET' : '';
  const viteSuf = isMainnet ? '_MAINNET' : '_SEPOLIA';
  console.log('==================================================');
  console.log('🎯 [3/3] BOOM. Pegá estas variables:');
  console.log('\n--- mangle-app/.env.local (backend) ---');
  console.log(`NEXT_PUBLIC_LENDING_POOL_CONTRACT${suf}=${poolAddress}`);
  console.log('\n--- mangle-mobile/.env.local (móvil) ---');
  console.log(`VITE_LENDING_POOL${viteSuf}=${poolAddress}`);
  console.log('\n⚠️ Backend y móvil DEBEN tener la MISMA dirección (el móvil toma el pool del backend vía pago-config).');
  console.log('Luego: reiniciá el backend (y rebuild del móvil si aplica) para que tomen el ABI v2 + la nueva dirección.');
  console.log('==================================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error en deploy-and-fund:\n', error);
    process.exit(1);
  });
