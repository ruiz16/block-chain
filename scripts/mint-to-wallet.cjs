// =============================================================================
// Mint MockCusd to any wallet — Celo Sepolia
// =============================================================================
//
// Usage:
//   npx hardhat run scripts/mint-to-wallet.cjs --network celoSepolia
// =============================================================================

const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const MOCK_CUSD = '0xb42aD227800bf1082A766Af8D2D221f43aE1e710';
  const TARGET_WALLET = '0xfDF7e81A976E3c4079DA45e39f7014A4e27445f4';
  const AMOUNT_CUSD = 1000; // 1000 cUSD

  const contract = await hre.ethers.getContractAt(
    ['function mint(address to, uint256 amount) external', 'function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'],
    MOCK_CUSD,
    deployer,
  );

  const symbol = await contract.symbol();
  const amountWei = hre.ethers.parseUnits(String(AMOUNT_CUSD), 18);

  console.log(`Minting ${AMOUNT_CUSD} ${symbol} to ${TARGET_WALLET}…`);

  const tx = await contract.mint(TARGET_WALLET, amountWei);
  await tx.wait();

  const balance = await contract.balanceOf(TARGET_WALLET);
  console.log(`✅ Done! Balance: ${hre.ethers.formatUnits(balance, 18)} ${symbol}`);
  console.log(`   Tx: https://celo-sepolia.blockscout.com/tx/${tx.hash}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
