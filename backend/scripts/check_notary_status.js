const { ethers } = require("ethers");
require('dotenv').config();

async function attemptMint() {
    const ntkAddress = "0xbB8bf3bbDa620416f856D50D2855fF1aC73552c2";
    const notaryWallet = "0xa82a6fcbb2db5979a6fcca83c24317605580310e";

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const relayerWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

        console.log(`Relayer Address: ${relayerWallet.address}`);

        const ntkContract = new ethers.Contract(ntkAddress, [
            "function owner() view returns (address)",
            "function hasRole(bytes32, address) view returns (bool)",
            "function MINTER_ROLE() view returns (bytes32)",
            "function mintDailyNTK(address)"
        ], relayerWallet);

        const owner = await ntkContract.owner();
        console.log(`Contract Owner: ${owner}`);

        if (owner === relayerWallet.address) {
            console.log("Relayer IS Owner.");
        } else {
            console.log("Relayer is NOT Owner.");
        }

        // Check Role
        try {
            const MINTER_ROLE = await ntkContract.MINTER_ROLE();
            const hasMinter = await ntkContract.hasRole(MINTER_ROLE, relayerWallet.address);
            console.log(`Relayer has MINTER_ROLE: ${hasMinter}`);
        } catch (e) {
            console.log("Role check failed (maybe not Startable/AccessControl?):", e.message);
        }

        // Attempt Mint
        console.log("Attempting `mintDailyNTK`...");
        try {
            const tx = await ntkContract.mintDailyNTK(notaryWallet);
            console.log(`Mint TX: ${tx.hash}`);
            await tx.wait();
            console.log("Mint SUCCESS!");
        } catch (e) {
            console.error("Mint FAILED:", e.message);
            if (e.info && e.info.error) console.error("Revert Data:", e.info.error.message);
        }

    } catch (err) {
        console.error("Script Error:", err);
    }
}

attemptMint();
