const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function assignRole(walletAddress, roleType = 'OWNER') {
    const ROLE_MAP = { 'NONE': 0, 'OWNER': 1, 'NOTARY': 2, 'ADMIN': 3 };
    const targetRole = ROLE_MAP[roleType.toUpperCase()];

    if (targetRole === undefined) {
        console.error(`Invalid role type: ${roleType}. Use OWNER, NOTARY, or ADMIN.`);
        return;
    }

    console.log(`🚀 Assigning role ${roleType} (${targetRole}) to ${walletAddress}...`);

    try {
        const { provider, signer } = await connectBNB();
        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;

        const abi = [
            "function roles(address) view returns (uint8)",
            "function assignOwner(address) external",
            "function promoteToNotary(address) external",
            "function promoteToAdmin(address) external",
            "function getUserRole(address) view returns (uint8)"
        ];

        const contract = new ethers.Contract(registryAddress, abi, signer);

        // 1. Check current role
        const currentRole = await contract.getUserRole(walletAddress);
        console.log(`Current On-Chain Role: ${currentRole}`);

        if (Number(currentRole) === targetRole) {
            console.log("✅ User already has the target role.");
            return;
        }

        // 2. Execute promotion based on target
        let tx;
        if (targetRole === 1) {
            console.log("Calling assignOwner...");
            tx = await contract.assignOwner(walletAddress);
        } else if (targetRole === 2) {
            console.log("Calling promoteToNotary...");
            tx = await contract.promoteToNotary(walletAddress);
        } else if (targetRole === 3) {
            console.log("Calling promoteToAdmin...");
            tx = await contract.promoteToAdmin(walletAddress);
        }

        if (tx) {
            console.log(`Transaction Sent: ${tx.hash}`);
            await tx.wait();
            console.log("✅ Transaction Confirmed.");

            const newRole = await contract.getUserRole(walletAddress);
            console.log(`New On-Chain Role: ${newRole}`);
        }

    } catch (err) {
        console.error("❌ Role Assignment Failed:", err.message);
        if (err.info?.error) console.error("Revert Reason:", err.info.error.message);
    }
}

const targetWallet = process.argv[2] || '0x91ed53552ca83709a06d5763315e09f5fc6cdd30';
const role = process.argv[3] || 'OWNER';
assignRole(targetWallet, role);
