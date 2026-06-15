// =============================================================================
// Send CELO for gas to a wallet
// =============================================================================
import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const target = ''; //Wallet de destino

  const tx = await deployer.sendTransaction({
    to: target,
    value: hre.ethers.parseEther('1'), // 1 CELO
  });
  await tx.wait();

  console.log(`✅ Sent 1 CELO to ${target}`);
  console.log(`   Tx: https://celo-sepolia.blockscout.com/tx/${tx.hash}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
