const pool = require('./src/db/index');
const { ethers } = require('ethers');
require('dotenv').config();

async function check() {
    const r = await pool.query('SELECT email, wallet_address FROM users');
    const users = r.rows;
    console.log('Users found:', users.length);

    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/');
    const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const ntkrContract = new ethers.Contract(ntkrAddress, abi, provider);

    for (const user of users) {
        if (!user.wallet_address) {
            console.log(`${user.email}: No wallet address`);
            continue;
        }
        try {
            const bal = await ntkrContract.balanceOf(user.wallet_address);
            console.log(`${user.email} (${user.wallet_address}): ${ethers.formatUnits(bal, 18)} NTKR (On-chain)`);
        } catch (e) {
            console.log(`${user.email}: Error fetching balance: ${e.message}`);
        }
    }
    process.exit();
}

check();
