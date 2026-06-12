// =============================================================================
// Check: is our deployer key the owner of MockCopm?
// =============================================================================
import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  const MOCK_COPM = '0x58d5cd6f4f272f6C15Eb69a8bCc13F9416a36369';

  const contract = await ethers.getContractAt(
    ['function owner() view returns (address)', 'function symbol() view returns (string)'],
    MOCK_COPM,
    deployer,
  );

  const owner = await contract.owner();
  const symbol = await contract.symbol();

  console.log('=== VERIFICACIÓN DE OWNER ===');
  console.log('');
  console.log('Contrato    :', MOCK_COPM);
  console.log('Symbol      :', symbol);
  console.log('');
  console.log('Owner on-chain :', owner);
  console.log('Deployer key   :', deployer.address);
  console.log('');
  console.log('¿Coinciden?   :', owner.toLowerCase() === deployer.address.toLowerCase() ? '✅ SÍ' : '❌ NO');
  console.log('');
  console.log('TotalSupply   :', ethers.formatUnits(await ethers.provider.getStorage(MOCK_COPM, 0), 0));

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log('▶ La wallet del .env.local NO es owner del contrato COPm.');
    console.log('▶ No puedes mintear hasta no usar la wallet que es owner.');
    console.log('▶ Owner real :', owner);
  } else {
    console.log('▶ La wallet es owner — deberías poder mintear sin problema.');
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
