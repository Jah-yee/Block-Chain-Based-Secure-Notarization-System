const pool = require('./src/db/index');
const { ethers } = require('ethers');
require('dotenv').config();

async function check() {
    const r = await pool.query('SELECT id, email, wallet_address, ntkr_balance FROM users');
    const users = r.rows;
    console.log('--- USER WALLET DATABASE DUMP ---');
    console.log(JSON.stringify(users, null, 2));

    const rpc = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
    console.log('RPC:', rpc);
    const provider = new ethers.JsonRpcProvider(rpc);

    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    console.log('NTKR Contract:', ntkrAddress);

    const abi = ["function balanceOf(address) view returns (uint256)"];
    const ntkrContract = new ethers.Contract(ntkrAddress, abi, provider);

    for (const user of users) {
        if (!user.wallet_address) continue;
        try {
            const bal = await ntkrContract.balanceOf(user.wallet_address);
            console.log(`Email: ${user.email}`);
            console.log(`Wallet: ${user.wallet_address}`);
            console.log(`On-chain: ${ethers.formatUnits(bal, 18)} NTKR`);
            console.log(`Internal: ${user.ntkr_balance} NTKR`);
            console.log('---');
        } catch (e) {
            console.log(`${user.email}: Error: ${e.message}`);
        }
    }
    process.exit();
}

check();
