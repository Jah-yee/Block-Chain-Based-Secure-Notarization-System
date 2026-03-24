require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "./.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.20",
    networks: {
        bnbTestnet: {
            url: process.env.BNB_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
            accounts: process.env.BNB_SYSTEM_PRIVATE_KEY ? [process.env.BNB_SYSTEM_PRIVATE_KEY] : [],
        },
    },
    paths: {
        sources: "../contracts",
        tests: "./tests/blockchain",
        cache: "./cache",
        artifacts: "./artifacts"
    }
};
