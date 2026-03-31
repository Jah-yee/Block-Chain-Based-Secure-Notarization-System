const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function verifyRelayer() {
    console.log("--- VERIFYING RELAYER ---");
    const { provider, signer } = await connectBNB();
    const relayerAddress = await signer.getAddress();
    console.log(`Relayer Address: ${relayerAddress}`);

    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    const ntkrABI = [
        "function RELAYER_ROLE() view returns (bytes32)",
        "function hasRole(bytes32, address) view returns (bool)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"
    ];

    const contract = new ethers.Contract(ntkrAddress, ntkrABI, provider);

    try {
        const RELAYER_ROLE = await contract.RELAYER_ROLE();
        const ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

        const isRelayer = await contract.hasRole(RELAYER_ROLE, relayerAddress);
        const isAdmin = await contract.hasRole(ADMIN_ROLE, relayerAddress);

        console.log(`RELAYER_ROLE Hash: ${RELAYER_ROLE}`);
        console.log(`Is Relayer: ${isRelayer}`);
        console.log(`Is Admin: ${isAdmin}`);

        if (!isRelayer) {
            console.error("❌ RELAYER_ROLE is MISSING! The backend cannot mint or approve actions.");
        } else {
            console.log("✅ RELAYER_ROLE is VALID.");
        }

    } catch (err) {
        console.error("Verification failed:", err.message);
    }
}

verifyRelayer();
