const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function checkRole(walletAddress) {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
    const abi = [
        "function getUserRole(address) view returns (uint8)",
        "function isBanned(address) view returns (bool)"
    ];

    const contract = new ethers.Contract(registryAddress, abi, provider);

    try {
        const role = await contract.getUserRole(walletAddress);
        const banned = await contract.isBanned(walletAddress);
        console.log(`Wallet: ${walletAddress}`);
        console.log(`Role: ${role}`);
        console.log(`Banned: ${banned}`);

        const ROLES = { 0: 'NONE', 1: 'OWNER', 2: 'NOTARY', 3: 'ADMIN' };
        console.log(`Role Name: ${ROLES[role] || 'UNKNOWN'}`);
    } catch (err) {
        console.error("Error checking role:", err.message);
    }
}

const target = process.argv[2] || '0x91ed53552ca83709a06d5763315e09f5fc6cdd30';
checkRole(target);
