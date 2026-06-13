// =============================================================================
// Fund LendingPool — Celo Sepolia (testnet)
// =============================================================================
// Mintea COPm al deployer (owner del MockCopm), aprueba el pool y llama fund().
//
// Usage:
//   npx hardhat run scripts/fund-lending-pool.mjs --network celoSepolia
//
// Env (.env.local):
//   NEXT_PUBLIC_COPM_CONTRACT
//   NEXT_PUBLIC_LENDING_POOL_CONTRACT
//   LENDING_POOL_FUND_AMOUNT  — COPm decimal a fondear. Default: 100000
// =============================================================================

import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const copmAddr = process.env.NEXT_PUBLIC_COPM_CONTRACT;
  const poolAddr = process.env.NEXT_PUBLIC_LENDING_POOL_CONTRACT;
  if (!copmAddr || !poolAddr) throw new Error('Faltan COPM o LENDING_POOL en .env.local');

  const amount = process.env.LENDING_POOL_FUND_AMOUNT ?? '100000';
  const amountWei = hre.ethers.parseUnits(amount, 18);

  const copm = await hre.ethers.getContractAt(
    [
      'function mint(address,uint256) external',
      'function approve(address,uint256) external returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ],
    copmAddr,
    deployer,
  );
  const pool = await hre.ethers.getContractAt(
    ['function fund(uint256) external'],
    poolAddr,
    deployer,
  );

  console.log(`Minting ${amount} COPm to deployer…`);
  await (await copm.mint(deployer.address, amountWei)).wait();

  console.log('Approving pool…');
  await (await copm.approve(poolAddr, amountWei)).wait();

  console.log('Funding pool…');
  await (await pool.fund(amountWei)).wait();

  const bal = await copm.balanceOf(poolAddr);
  console.log(`✅ Pool balance: ${hre.ethers.formatUnits(bal, 18)} COPm`);
}

main().then(() => process.exit(0)).catch((err) => { console.error('❌', err); process.exit(1); });
