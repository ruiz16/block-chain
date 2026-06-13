// =============================================================================
// Deploy LendingPool — Celo Sepolia
// =============================================================================
// Usage:
//   npx hardhat run scripts/deploy-lending-pool.mjs --network celoSepolia
//
// Env (.env.local):
//   CELO_PRIVATE_KEY            — deployer (será owner y disburser por defecto)
//   NEXT_PUBLIC_COPM_CONTRACT   — dirección del token COPm ya desplegado
//   LENDING_POOL_MAX_DISBURSEMENT — cap por desembolso en COPm (decimal). Default: 1000000
// =============================================================================

import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const copm = process.env.NEXT_PUBLIC_COPM_CONTRACT;
  if (!copm) throw new Error('Falta NEXT_PUBLIC_COPM_CONTRACT en .env.local');

  const maxCopm = process.env.LENDING_POOL_MAX_DISBURSEMENT ?? '1000000';
  const maxWei = hre.ethers.parseUnits(maxCopm, 18);

  // owner y disburser = deployer por ahora. En mainnet: owner debe ser multisig.
  const owner = deployer.address;
  const disburser = deployer.address;

  console.log('Deploying LendingPool to', hre.network.name);
  console.log('  COPm      :', copm);
  console.log('  Owner     :', owner);
  console.log('  Disburser :', disburser);
  console.log('  Max/tx    :', maxCopm, 'COPm');

  const Pool = await hre.ethers.getContractFactory('LendingPool');
  const pool = await Pool.deploy(copm, owner, disburser, maxWei);
  await pool.waitForDeployment();
  const addr = await pool.getAddress();

  console.log('');
  console.log('✅ LendingPool deployed at:', addr);
  console.log('   Explorer: https://celo-sepolia.blockscout.com/address/' + addr);
  console.log('');
  console.log('▶ Set in mangle-app/.env.local:');
  console.log('   NEXT_PUBLIC_LENDING_POOL_CONTRACT=' + addr);
  console.log('▶ Set in mangle-mobile/.env:');
  console.log('   VITE_LENDING_POOL_SEPOLIA=' + addr);
}

main().then(() => process.exit(0)).catch((err) => { console.error('❌', err); process.exit(1); });
