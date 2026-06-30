// =============================================================================
// Hardhat Configuration — Celo Sepolia
// =============================================================================
// Uses CommonJS to avoid tsconfig/bundler conflicts with the Next.js
// project's TypeScript configuration.
// =============================================================================

require('dotenv').config({ path: '.env.local' });
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-verify');
require('@nomicfoundation/hardhat-chai-matchers');

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    celoSepolia: {
      url: process.env.CELO_RPC_URL,
      chainId: 11142220,
      accounts: process.env.CELO_PRIVATE_KEY
        ? [process.env.CELO_PRIVATE_KEY.startsWith('0x')
          ? process.env.CELO_PRIVATE_KEY
          : `0x${process.env.CELO_PRIVATE_KEY}`]
        : [],
    },

    // Celo mainnet — deploy/fund del LendingPool real.
    // Requiere CELO_RPC_URL_MAINNET y CELO_PRIVATE_KEY_MAINNET en .env.local.
    celo: {
      url: process.env.CELO_RPC_URL_MAINNET,
      chainId: 42220,
      accounts: process.env.CELO_PRIVATE_KEY_MAINNET
        ? [process.env.CELO_PRIVATE_KEY_MAINNET.startsWith('0x')
          ? process.env.CELO_PRIVATE_KEY_MAINNET
          : `0x${process.env.CELO_PRIVATE_KEY_MAINNET}`]
        : [],
    },
  },

  etherscan: {
    apiKey: {
      'celo-sepolia': 'empty',
      // Para verificar en Celoscan mainnet, poné tu API key de celoscan.io aquí
      // (o seteá CELOSCAN_API_KEY en .env.local).
      celo: process.env.CELOSCAN_API_KEY || 'empty',
    },
    customChains: [
      {
        network: 'celo-sepolia',
        chainId: 11142220,
        urls: {
          apiURL: 'https://celo-sepolia.blockscout.com/api',
          browserURL: 'https://celo-sepolia.blockscout.com',
        },
      },
      {
        network: 'celo',
        chainId: 42220,
        urls: {
          apiURL: 'https://api.celoscan.io/api',
          browserURL: 'https://celoscan.io',
        },
      },
    ],
  },
};
