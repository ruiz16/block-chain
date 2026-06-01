// =============================================================================
// Hardhat Configuration — Celo Sepolia
// =============================================================================
// Uses CommonJS to avoid tsconfig/bundler conflicts with the Next.js
// project's TypeScript configuration.
// =============================================================================

require('dotenv').config({ path: '.env.local' });
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-verify');

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
  },

  etherscan: {
    apiKey: {
      'celo-sepolia': 'empty',
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
    ],
  },
};
