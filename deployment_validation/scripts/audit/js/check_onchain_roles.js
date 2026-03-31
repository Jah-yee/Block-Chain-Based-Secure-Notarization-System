const { ethers } = require("ethers");
require("dotenv").config();

async function checkRoles() {
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
    const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
    const adminWallet = "0x02252db03af7cd8c8d3ec6cfd3ae5f6dab69acd0";
    const ownerWallet = "0x91ed53552ca83709a06d5763315e09f5fc6cdd30";

    const abi = [
        "function getUserRole(address) view returns (uint8)",
        "function isBanned(address) view returns (bool)"
    ];

    const contract = new ethers.Contract(registryAddress, abi, provider);

    const wallets = [
        { name: "Admin (admin@bbsns.com)", address: adminWallet },
        { name: "Owner (owner@bbsns.com)", address: ownerWallet }
    ];

    for (const w of wallets) {
        try {
            const role = await contract.getUserRole(w.address);
            const banned = await contract.isBanned(w.address);
            console.log(`${w.name} (${w.address}): Role ${role}, Banned: ${banned}`);
        } catch (err) {
            console.error(`Error checking ${w.name}:`, err.message);
        }
    }
}

checkRoles();
