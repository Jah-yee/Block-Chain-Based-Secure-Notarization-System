require('dotenv').config({ path: '../.env' });
const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const pool = require("../src/db/index");
const NTKR_ABI = require("../../contracts/abi/NTKRToken.json");

async function upgradeLimit() {
    console.log("Attempting to Upgrade User Limit (Fallback Strategy)...");

    // 1. Find User
    const partialWallet = '%91ed%dd30';
    const res = await pool.query("SELECT id, wallet_address FROM users WHERE wallet_address LIKE $1", [partialWallet]);
    if (res.rows.length === 0) throw new Error("User not found");
    const user = res.rows[0];
    console.log(`Target User: ${user.wallet_address}`);

    // 2. Connect
    const { relayerSigner } = await connectBNB();
    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    const ntkrContract = new ethers.Contract(ntkrAddress, NTKR_ABI.abi || NTKR_ABI, relayerSigner);

    // 3. Check Admin Role
    const ADMIN_ROLE = await ntkrContract.DEFAULT_ADMIN_ROLE();
    const isAdmin = await ntkrContract.hasRole(ADMIN_ROLE, relayerSigner.address);
    console.log(`Is Relayer Admin? ${isAdmin}`);

    if (isAdmin) {
        console.log("Authorized. Updating Package 1 to Limit 10...");
        try {
            const tx = await ntkrContract.setPackage(1, ethers.parseEther("0.001"), ethers.parseEther("5"), 10);
            await tx.wait();
            console.log("Package 1 Updated.");

            console.log("Applying Package 1 to user...");
            const tx2 = await ntkrContract.sponsoredBuyPackage(user.wallet_address, 1);
            await tx2.wait();
            console.log("User Upgraded via Package 1.");
        } catch (err) {
            console.error("Admin update failed:", err.message);
        }
    } else {
        console.warn("⚠️ Relayer is NOT Admin. Cannot change Package 1 config.");
        console.log("💡 Strategy: Give user Package 3 (Enterprise) which inherently has Limit 10.");

        // Package 3: 30 NTKR, Limit 10.
        try {
            const tx = await ntkrContract.sponsoredBuyPackage(user.wallet_address, 3);
            console.log(`Sending Package 3 (Limit 10)... Tx: ${tx.hash}`);
            await tx.wait();
            console.log("✅ User Upgraded via Package 3 (Enterprise). Limit should be 10.");
        } catch (err) {
            console.error("Failed to give Package 3:", err.message);
        }
    }

    // Verify
    const newLimit = await ntkrContract.userDailyLimit(user.wallet_address);
    console.log(`New User Limit: ${newLimit.toString()}`);

    if (newLimit.toString() == "10") {
        console.log("SUCCESS");
    } else {
        console.log("FAILURE");
    }

    process.exit(0);
}

upgradeLimit().catch(console.error);
