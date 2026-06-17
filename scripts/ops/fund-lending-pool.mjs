// =============================================================================
// Fondear el LendingPool con COPm — network-aware (testnet | mainnet)
// -----------------------------------------------------------------------------
// La red la define hardhat (--network). Según la red, lee las variables
// correctas de .env.local:
//   mainnet (--network celo)        → NEXT_PUBLIC_*_MAINNET
//   testnet (--network celoSepolia) → NEXT_PUBLIC_* (nombre plano)
//
// Monto: por defecto 50.000 COPm. Override con FUND_AMOUNT.
//
// Uso:
//   npx hardhat run scripts/fund-lending-pool.mjs --network celoSepolia
//   FUND_AMOUNT=25000 npx hardhat run scripts/fund-lending-pool.mjs --network celo
// =============================================================================
import hre from "hardhat";

function reqEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`❌ Falta ${name} en .env.local`);
  return v.trim();
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const isMainnet = hre.network.name === 'celo';
  const suffix = isMainnet ? '_MAINNET' : '';

  const copmAddress = hre.ethers.getAddress(reqEnv(`NEXT_PUBLIC_COPM_CONTRACT${suffix}`));
  const poolAddress = hre.ethers.getAddress(reqEnv(`NEXT_PUBLIC_LENDING_POOL_CONTRACT${suffix}`));
  const amountStr = (process.env.FUND_AMOUNT || '50000').trim();

  console.log('==================================================');
  console.log(`🌐 Red          : ${hre.network.name} ${isMainnet ? '(MAINNET)' : '(testnet)'}`);
  console.log(`💳 Fondeadora   : ${deployer.address}`);
  console.log(`🪙 COPm         : ${copmAddress}`);
  console.log(`🏦 LendingPool  : ${poolAddress}`);
  console.log(`💵 Monto        : ${amountStr} COPm`);
  console.log('==================================================\n');

  const copm = await hre.ethers.getContractAt(
    [
      "function balanceOf(address) view returns (uint256)",
      "function approve(address, uint256) returns (bool)",
      "function symbol() view returns (string)",
    ],
    copmAddress,
  );
  const lendingPool = await hre.ethers.getContractAt(
    ["function fund(uint256) external"],
    poolAddress,
  );

  const amountToFund = hre.ethers.parseUnits(amountStr, 18);

  // 1. Validar saldo
  const balance = await copm.balanceOf(deployer.address);
  console.log(`💰 Saldo COPm de la fondeadora: ${hre.ethers.formatUnits(balance, 18)}`);
  if (balance < amountToFund) {
    throw new Error(`❌ Saldo insuficiente: necesitás ${amountStr} COPm y tenés ${hre.ethers.formatUnits(balance, 18)}.`);
  }

  // 2. Approve
  console.log("⏳ Aprobando al LendingPool para transferir COPm...");
  const approveTx = await copm.approve(poolAddress, amountToFund);
  await approveTx.wait();
  console.log("✅ Approve confirmado.");

  // 3. fund()
  console.log(`⏳ Depositando ${amountStr} COPm en el pool...`);
  const fundTx = await lendingPool.fund(amountToFund);
  await fundTx.wait();

  console.log("\n🎉 ¡Pool fondeado con éxito!");
  console.log(`   Tx: ${fundTx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error en el fondeo:", error.message || error);
    process.exit(1);
  });
