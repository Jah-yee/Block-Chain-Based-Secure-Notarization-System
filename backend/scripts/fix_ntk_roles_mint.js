const { ethers } = require("ethers");
require('dotenv').config();

async function fixRolesAndMint() {
    const ntkAddress = process.env.NTK_CONTRACT_ADDRESS;
    const notaryWallet = "0xa82a6fcbb2db5979a6fcca83c24317605580310e";

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const adminWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

        console.log(`Admin Wallet: ${adminWallet.address}`);

        // ABI for AccessControl and Minting
        const abi = [
            "function hasRole(bytes32, address) view returns (bool)",
            "function grantRole(bytes32, address)",
            "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
            "function RELAYER_ROLE() view returns (bytes32)",
            "function mintDailyNTK(address)",
            "function balanceOf(address) view returns (uint256)"
        ];

        const ntkContract = new ethers.Contract(ntkAddress, abi, adminWallet);

        // 1. Check Admin Role
        const ADMIN_ROLE = await ntkContract.DEFAULT_ADMIN_ROLE();
        const hasAdmin = await ntkContract.hasRole(ADMIN_ROLE, adminWallet.address);
        console.log(`Has DEFAULT_ADMIN_ROLE: ${hasAdmin}`);

        if (!hasAdmin) {
            console.error("CRITICAL: System Key is NOT Admin. Cannot grant roles.");
            // We will try to rely on existing RELAYER_ROLE if present
        }

        // 2. Check/Grant Relayer Role
        let RELAYER_ROLE;
        try {
            RELAYER_ROLE = await ntkContract.RELAYER_ROLE();
        } catch (e) {
            // Fallback if RELAYER_ROLE getter is missing or named differently?
            // But debug_ntk_abi didn't check it. We assume it exists.
            console.error("Could not get RELAYER_ROLE hash:", e.message);
            return;
        }

        const hasRelayer = await ntkContract.hasRole(RELAYER_ROLE, adminWallet.address);
        console.log(`Has RELAYER_ROLE: ${hasRelayer}`);

        if (!hasRelayer && hasAdmin) {
            console.log("Granting RELAYER_ROLE to self...");
            const tx = await ntkContract.grantRole(RELAYER_ROLE, adminWallet.address);
            console.log(`Grant TX: ${tx.hash}`);
            await tx.wait();
            console.log("Role Granted!");
        } else if (!hasRelayer && !hasAdmin) {
            console.error("Cannot mint: Missing RELAYER_ROLE and cannot grant it.");
            return;
        }

        // 3. Check Balance and Mint
        const balance = await ntkContract.balanceOf(notaryWallet);
        console.log(`Notary Balance: ${ethers.formatEther(balance)}`);

        if (balance === 0n) {
            console.log("Attempting Mint...");
            try {
                const tx = await ntkContract.mintDailyNTK(notaryWallet);
                console.log(`Mint TX: ${tx.hash}`);
                await tx.wait();
                console.log("Mint SUCCESS!");
            } catch (e) {
                console.error("Mint Failed:", e.message);
                if (e.info?.error) console.error("Revert:", e.info.error.message);
            }
        } else {
            console.log("Balance is sufficient.");
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

fixRolesAndMint();
