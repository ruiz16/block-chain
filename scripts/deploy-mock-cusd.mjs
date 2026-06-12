// =============================================================================
// Deploy MockCusd — Celo Sepolia
// =============================================================================
//
// Usage:
//   npx hardhat run scripts/deploy-mock-cusd.cjs --network celoSepolia
//
// Environment variables (from .env.local):
//   CELO_PRIVATE_KEY  — Deployer wallet private key (required)
//   CELO_RPC_URL      — Optional RPC override
// =============================================================================

import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Deploying MockCusd to Celo Sepolia          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Network  : ${hre.network.name} (${hre.network.config.chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} CELO`);
  console.log('');

  // -------------------------------------------------------------------
  // 1. Deploy contract
  // -------------------------------------------------------------------

  console.log('  Deploying MockCusd…');

  const MockCusd = await hre.ethers.getContractFactory('MockCusd');
  const contract = await MockCusd.deploy('Celo Dollar', 'cUSD');

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();

  console.log(`  ✅ Deployed at: ${contractAddress}`);
  console.log('');

  // -------------------------------------------------------------------
  // 2. Mint test tokens to deployer (platform wallet)
  // -------------------------------------------------------------------

  const mintAmount = hre.ethers.parseUnits('10000', 18); // 10,000 cUSD
  console.log(`  Minting ${hre.ethers.formatUnits(mintAmount, 18)} cUSD to deployer…`);

  const tx = await contract.mint(deployer.address, mintAmount);
  await tx.wait();

  const balance = await contract.balanceOf(deployer.address);
  console.log(`  ✅ Balance: ${hre.ethers.formatUnits(balance, 18)} cUSD`);
  console.log('');

  // -------------------------------------------------------------------
  // 3. Summary
  // -------------------------------------------------------------------

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Deployment Complete                             ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Contract : ${contractAddress}`);
  console.log(`  Explorer : https://celo-sepolia.blockscout.com/address/${contractAddress}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Minted   : ${hre.ethers.formatUnits(balance, 18)} cUSD`);
  console.log('');
  console.log('  ▶ Set this address in your .env.local:');
  console.log(`    CELO_CUSD_CONTRACT=${contractAddress}`);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('  ❌ Deployment failed:', err);
    process.exit(1);
  });
