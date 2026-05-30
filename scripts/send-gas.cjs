// =============================================================================
// Send CELO for gas to a wallet
// =============================================================================
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const target = '0x872a34f6320f8ab2394C7D0E205d83d6eEf77911';

  const tx = await deployer.sendTransaction({
    to: target,
    value: hre.ethers.parseEther('1'), // 1 CELO
  });
  await tx.wait();

  console.log(`✅ Sent 1 CELO to ${target}`);
  console.log(`   Tx: https://celo-sepolia.blockscout.com/tx/${tx.hash}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
