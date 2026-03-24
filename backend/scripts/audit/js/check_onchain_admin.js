const { ethers } = require("ethers");
require("dotenv").config();

async function checkAdmin() {
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
    const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
    const adminWallet = "0x02252db03af7cd8c8d3ec6cfd3ae5f6dab69acd0";

    const abi = [
        "function getUserRole(address) view returns (uint8)",
        "function isBanned(address) view returns (bool)"
    ];

    const contract = new ethers.Contract(registryAddress, abi, provider);

    try {
        const role = await contract.getUserRole(adminWallet);
        const banned = await contract.isBanned(adminWallet);
        console.log(`Wallet: ${adminWallet}`);
        console.log(`Role: ${role}`);
        console.log(`Banned: ${banned}`);
    } catch (err) {
        console.error("Error checking role:", err.message);
    }
}

checkAdmin();
