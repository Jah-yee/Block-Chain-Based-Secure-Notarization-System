require('dotenv').config({ path: '../.env' });
const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const pool = require("../src/db/index");
const NTKR_ABI = require("../../contracts/abi/NTKRToken.json");

async function debugBalance() {
    console.log("--- FINAL DEBUG & FIX ---");

    // 1. Find User
    const partialWallet = '%91ed%dd30';
    const res = await pool.query("SELECT id, wallet_address FROM users WHERE wallet_address LIKE $1", [partialWallet]);
    if (res.rows.length === 0) throw new Error("User not found");
    const user = res.rows[0];
    console.log(`User: ${user.wallet_address}`);

    // 2. Connect
    const { relayerSigner } = await connectBNB();
    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    const ntkrContract = new ethers.Contract(ntkrAddress, NTKR_ABI.abi || NTKR_ABI, relayerSigner);

    // 3. Dump State
    const balance = await ntkrContract.balanceOf(user.wallet_address);
    const dailyLimit = await ntkrContract.userDailyLimit(user.wallet_address);
    const submissionCount = await ntkrContract.dailySubmissionCount(user.wallet_address);

    console.log(`Balance: ${ethers.formatEther(balance)} NTKR`);
    console.log(`Daily Limit: ${dailyLimit.toString()}`);
    console.log(`Submission Count: ${submissionCount.toString()}`);

    // 4. Check Prices
    const priceBasic = ethers.formatEther(await ntkrContract.categoryPrices(0));
    const priceOfficial = ethers.formatEther(await ntkrContract.categoryPrices(1));
    console.log(`Price Cat 0: ${priceBasic}`);
    console.log(`Price Cat 1: ${priceOfficial}`);

    // Logic Check
    if (Number(submissionCount) >= Number(dailyLimit)) {
        console.error("❌ STILL BLOCKED BY LIMIT!");
        // Force Reset Limit for testing?
        // We can't easily reset count without a new day.
        // But we can INCREASE limit further if needed?
        // We already set it to 10.
    } else {
        console.log("✅ LIMIT OK.");
    }

    if (parseFloat(ethers.formatEther(balance)) < parseFloat(priceBasic)) {
        console.error("❌ INSUFFICIENT BALANCE!");
    } else {
        console.log("✅ BALANCE OK.");
    }

    process.exit(0);
}

debugBalance().catch(console.error);
