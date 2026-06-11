// =============================================================================
// Mint MockCOPm to any wallet — Celo Sepolia
// =============================================================================
//
// Usage:
//   npx hardhat run scripts/mint-copm.js --network celoSepolia
// =============================================================================

const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const MOCK_COPM     = '0x58d5cd6f4f272f6C15Eb69a8bCc13F9416a36369';
  const TARGET_WALLET = '0xC37B88e18B769Bdf0Ac8086741a2c522520634a2';
  const AMOUNT_COPM   = 200000; // 200.000 COPm

  const contract = await hre.ethers.getContractAt(
    ['function mint(address to, uint256 amount) external', 'function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'],
    MOCK_COPM,
    deployer,
  );

  const symbol = await contract.symbol();
  const amountWei = hre.ethers.parseUnits(String(AMOUNT_COPM), 18);

  console.log(`Minting ${AMOUNT_COPM} ${symbol} to ${TARGET_WALLET}…`);

  const tx = await contract.mint(TARGET_WALLET, amountWei);
  await tx.wait();

  const balance = await contract.balanceOf(TARGET_WALLET);
  console.log(`✅ Done! Balance: ${hre.ethers.formatUnits(balance, 18)} ${symbol}`);
  console.log(`   Tx: https://celo-sepolia.blockscout.com/tx/${tx.hash}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
