// =============================================================================
// Mint MockCOPm to any wallet — Celo Sepolia
// =============================================================================
//
// Usage:
//   npx hardhat run scripts/mint-copm.cjs --network celoSepolia
// =============================================================================

import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Parametrizable por env (con defaults sensatos):
  //   MOCK_COPM   → dirección del Mock COPm (default: NEXT_PUBLIC_COPM_CONTRACT)
  //   MINT_TO     → destino (default: el owner = la wallet deployer)
  //   MINT_AMOUNT → monto en COPm human (default: 300000)
  const MOCK_COPM     = process.env.MOCK_COPM || process.env.NEXT_PUBLIC_COPM_CONTRACT;
  const TARGET_WALLET = process.env.MINT_TO || deployer.address;
  const AMOUNT_COPM   = Number(process.env.MINT_AMOUNT || 300000);

  if (!MOCK_COPM) throw new Error('❌ Falta MOCK_COPM o NEXT_PUBLIC_COPM_CONTRACT en .env.local');

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
