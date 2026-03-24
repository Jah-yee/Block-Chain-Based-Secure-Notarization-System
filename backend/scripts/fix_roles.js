const { ethers } = require("ethers");
require('dotenv').config();

async function fixRoles() {
    const ntkAddress = "0xbB8bf3bbDa620416f856D50D2855fF1aC73552c2";
    const notaryWallet = "0xa82a6fcbb2db5979a6fcca83c24317605580310e";

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const relayerWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

        console.log(`Relayer/Admin: ${relayerWallet.address}`);

        const ntkContract = new ethers.Contract(ntkAddress, [
            "function hasRole(bytes32, address) view returns (bool)",
            "function getRoleAdmin(bytes32) view returns (bytes32)",
            "function grantRole(bytes32, address)",
            "function RELAYER_ROLE() view returns (bytes32)",
            "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
            "function mintDailyNTK(address)"
        ], relayerWallet);

        const ADMIN_ROLE = await ntkContract.DEFAULT_ADMIN_ROLE();
        const hasAdmin = await ntkContract.hasRole(ADMIN_ROLE, relayerWallet.address);
        console.log(`Has Admin Role: ${hasAdmin}`);

        const RELAYER_ROLE = await ntkContract.RELAYER_ROLE();
        console.log(`RELAYER_ROLE Hash: ${RELAYER_ROLE}`);

        const hasRelayer = await ntkContract.hasRole(RELAYER_ROLE, relayerWallet.address);
        console.log(`Has Relayer Role: ${hasRelayer}`);

        if (hasAdmin && !hasRelayer) {
            console.log("Granting RELAYER_ROLE to self...");
            const tx = await ntkContract.grantRole(RELAYER_ROLE, relayerWallet.address);
            console.log(`Grant TX: ${tx.hash}`);
            await tx.wait();
            console.log("Role Granted!");
        }

        console.log("Attempting Mint...");
        try {
            const tx = await ntkContract.mintDailyNTK(notaryWallet);
            console.log(`Mint TX: ${tx.hash}`);
            await tx.wait();
            console.log("Mint Success!");
        } catch (e) {
            console.error("Mint Failed:", e.message);
            if (e.info?.error) console.error("Revert:", e.info.error.message);
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

fixRoles();
