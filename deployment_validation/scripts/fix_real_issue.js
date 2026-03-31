const { ethers } = require("ethers");
require('dotenv').config();

async function fixRealIssue() {
    const ntkAddress = "0x56f1be37bcf831Cb3b2a2Ff048346C1B76B2ABdb";
    const notaryWallet = "0xa82a6fcbb2db5979a6fcca83c24317605580310e";

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const adminWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

        console.log(`Admin Wallet: ${adminWallet.address}`);

        const ntkContract = new ethers.Contract(ntkAddress, [
            "function owner() view returns (address)",
            "function balanceOf(address) view returns (uint256)",
            "function mintDailyNTK(address)",
            "function RELAYER_ROLE() view returns (bytes32)",
            "function hasRole(bytes32, address) view returns (bool)",
            "function grantRole(bytes32, address)"
        ], adminWallet);

        const owner = await ntkContract.owner();
        console.log(`NTK Owner: ${owner}`);

        if (owner === adminWallet.address) {
            console.log("Admin IS Owner.");
        } else {
            console.log("Admin is NOT Owner.");
        }

        const balance = await ntkContract.balanceOf(notaryWallet);
        console.log(`Notary Balance: ${ethers.formatEther(balance)}`);

        if (balance === 0n) {
            console.log("Balance is 0. Attempting Mint...");

            // Grant Relayer Role to self if needed (if logic requires it)
            // Usually owner can bypass, or owner needs to grant role to self.
            const RELAYER_ROLE = await ntkContract.RELAYER_ROLE();
            const hasRole = await ntkContract.hasRole(RELAYER_ROLE, adminWallet.address);
            console.log(`Admin has RELAYER_ROLE: ${hasRole}`);

            if (!hasRole && owner === adminWallet.address) {
                console.log("Granting RELAYER_ROLE to Admin...");
                const tx = await ntkContract.grantRole(RELAYER_ROLE, adminWallet.address);
                await tx.wait();
                console.log("Granted!");
            }

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
            console.log("Balance Sufficient.");
        }

    } catch (err) {
        console.error("Error:", err);
    }
}

fixRealIssue();
