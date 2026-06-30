import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('==================================================');
  console.log('🚀 Iniciando despliegue de LendingPool...');
  console.log(`Wallet Deployer (Owner & Disburser): ${deployer.address}`);
  console.log('==================================================\n');

  // 1. Validar y limpiar la dirección del token COPm (network-aware)
  //    mainnet (--network celo) → COPm REAL de Mento; testnet → Mock COPm.
  const isMainnet = hre.network.name === 'celo';
  const copmEnvVar = isMainnet ? 'NEXT_PUBLIC_COPM_CONTRACT_MAINNET' : 'NEXT_PUBLIC_COPM_CONTRACT';
  const copmAddressEnv = process.env[copmEnvVar];
  if (!copmAddressEnv) {
    throw new Error(`❌ Error: ${copmEnvVar} no está definido.`);
  }
  const cleanCopmAddress = hre.ethers.getAddress(copmAddressEnv.trim());
  console.log(`🌐 Red: ${hre.network.name}${isMainnet ? ' (MAINNET — COPm real)' : ''}`);
  console.log(`🔗 Token COPm (${copmEnvVar}): ${cleanCopmAddress}`);

  // 2. Configurar los parámetros del constructor
  const ownerAddress = deployer.address;
  const disburserAddress = deployer.address;
  // Límite de 1 millón de COPm por desembolso (ajustable después)
  const maxDisbursement = hre.ethers.parseUnits("1000000", 18); 

  console.log('⏳ Enviando transacción con 4 parámetros al constructor...');

  // 3. Desplegar pasando los 4 argumentos exactos que pide tu Solidity
  const LendingPoolFactory = await hre.ethers.getContractFactory('LendingPool');
  const lendingPool = await LendingPoolFactory.deploy(
    cleanCopmAddress,
    ownerAddress,
    disburserAddress,
    maxDisbursement
  );
  
  await lendingPool.waitForDeployment();
  const deployedAddress = await lendingPool.getAddress();

  const poolEnvVar = isMainnet
    ? 'NEXT_PUBLIC_LENDING_POOL_CONTRACT_MAINNET'
    : 'NEXT_PUBLIC_LENDING_POOL_CONTRACT';

  console.log('\n==================================================');
  console.log(`✅ ¡CONTRATO DESPLEGADO CON ÉXITO!`);
  console.log(`📍 Dirección del LendingPool: ${deployedAddress}`);
  console.log('\n👉 Seteá en .env.local (backend):');
  console.log(`   ${poolEnvVar}=${deployedAddress}`);
  if (isMainnet) {
    console.log('👉 Y en el móvil (mangle-mobile .env.local):');
    console.log(`   VITE_LENDING_POOL_MAINNET=${deployedAddress}`);
    console.log('   (deben ser IGUALES: el móvil toma el pool del backend vía pago-config)');
  }
  console.log('==================================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error durante el despliegue:\n', error);
    process.exit(1);
  });