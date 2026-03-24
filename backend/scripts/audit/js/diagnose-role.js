const { Pool } = require('pg');
const { ethers } = require('ethers');
require('dotenv').config();

async function diagnoseNotary() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);

    try {
        console.log("🔍 Querying Database for notary@bbsns.com...");
        const dbRes = await pool.query("SELECT id, wallet_address, role FROM users WHERE email = 'notary@bbsns.com';");

        if (dbRes.rows.length === 0) {
            console.error("❌ User notary@bbsns.com not found in database.");
            return;
        }

        const user = dbRes.rows[0];
        console.log(`✅ Database Entry Found:`);
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Wallet: ${user.wallet_address}`);
        console.log(`   - DB Role: ${user.role}`);

        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
        console.log(`🔍 Checking On-Chain Role at: ${registryAddress}`);

        const abi = ["function getUserRole(address) view returns (uint8)"];
        const contract = new ethers.Contract(registryAddress, abi, provider);

        const liveRole = await contract.getUserRole(user.wallet_address);
        console.log(`✅ On-Chain Role: ${liveRole}`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

diagnoseNotary();
