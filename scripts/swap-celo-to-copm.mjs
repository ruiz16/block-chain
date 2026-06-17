import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('==================================================');
  console.log(`🤖 Iniciando Mini-Broker de Intercambio...`);
  console.log(`Wallet: ${deployer.address}`);
  console.log('==================================================\n');

  // Forzamos minúsculas y dejamos que Ethers v6 calcule el Checksum perfecto
  const CELO_ADDRESS = hre.ethers.getAddress("0xf194afdf50b03e69bd7d057c1aa9e10c9954e4c9"); 
  const MENTO_BROKER_ADDRESS = hre.ethers.getAddress("0x32a922a3b6c2057f3a531c614e9f768652d4096c");
  const COPM_ADDRESS = hre.ethers.getAddress(process.env.NEXT_PUBLIC_COPM_CONTRACT.trim());
  
  console.log(`🔗 Broker de Mento validado: ${MENTO_BROKER_ADDRESS}`);

  const celoAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
  const brokerAbi = [
    "function swapIn(address exchange, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata data) external returns (uint256 amountOut)"
  ];

  const celoToken = await hre.ethers.getContractAt(celoAbi, CELO_ADDRESS);
  const mentoBroker = await hre.ethers.getContractAt(brokerAbi, MENTO_BROKER_ADDRESS);

  const amountInCELO = hre.ethers.parseUnits("1000", 18);
  const minAmountOutCOPM = 0; 

  console.log("⏳ Autorizando al Broker de Mento para transferir 1000 CELO...");
  const approveTx = await celoToken.approve(MENTO_BROKER_ADDRESS, amountInCELO);
  await approveTx.wait();
  console.log("✅ Permiso concedido.");

  console.log(`⏳ Ejecutando intercambio en bloque de 1000 CELO a COPm...`);
  
  const swapTx = await mentoBroker.swapIn(
    MENTO_BROKER_ADDRESS, 
    CELO_ADDRESS,         
    COPM_ADDRESS,         
    amountInCELO,         
    minAmountOutCOPM,     
    "0x"                  
  );

  await swapTx.wait();
  console.log("\n==================================================");
  console.log("🎉 ¡INTERCAMBIO MASIVO EXITOSO DESDE EL BROKER!");
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error en el Broker de intercambio:\n", error.message || error);
    process.exit(1);
  });