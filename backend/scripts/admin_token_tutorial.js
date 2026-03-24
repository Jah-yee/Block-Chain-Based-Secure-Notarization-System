const { Pool } = require('pg');
const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function runTutorial(email) {
    console.log(`\n📘 BBSNS TOKEN ACQUISITION TUTORIAL`);
    console.log(`-----------------------------------`);
    console.log(`User: ${email}\n`);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Check User Identity
        const userRes = await pool.query("SELECT id, wallet_address FROM users WHERE email = $1", [email]);
        if (userRes.rows.length === 0) throw new Error("User not found in database. Please register first.");
        const user = userRes.rows[0];

        console.log(`✅ Identity Verified: ${user.wallet_address}`);
        console.log(`\n[STEP 1] Adding NTKR to MetaMask`);
        console.log(`- Contract Address: ${process.env.NTKR_CONTRACT_ADDRESS}`);
        console.log(`- Symbol: NTKR`);
        console.log(`- Decimals: 18`);
        console.log(`- Network: BNB Smart Chain (Testnet)`);

        console.log(`\n[STEP 2] How to Buy Tokens`);
        console.log(`1. Visit the 'Buy Tokens' section in the Web Dashboard.`);
        console.log(`2. Select a package: Basic (5 NTKR), Official (25 NTKR), or High Value (100 NTKR).`);
        console.log(`3. Confirm the transaction in MetaMask.`);
        console.log(`4. The smart contract will automatically transfer NTKR to your wallet and deduct the BNB cost.`);

        console.log(`\n[DIAGNOSTIC] Current Wallet State:`);
        const { provider } = await connectBNB();
        const ntkAddress = process.env.NTKR_CONTRACT_ADDRESS;
        const abi = ["function balanceOf(address) view returns (uint256)"];
        const contract = new ethers.Contract(ntkAddress, abi, provider);

        const balance = await contract.balanceOf(user.wallet_address);
        console.log(`- On-Chain Balance: ${ethers.formatEther(balance)} NTKR`);

        console.log(`\n[NOTE] Admin Minting is restricted to emergency/testing only.`);
        console.log(`BBSNS is a decentralized protocol; users are responsible for their own token lifecycle.\n`);

    } catch (err) {
        console.error("❌ Diagnostic Failed:", err.message);
    } finally {
        await pool.end();
    }
}

const targetEmail = process.argv[2] || 'owner@bbsns.com';
runTutorial(targetEmail);
