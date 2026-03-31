const { ethers } = require('ethers');
const pool = require('./src/db/index');

async function checkBalance() {
    try {
        // Get notary wallet
        const result = await pool.query(
            "SELECT wallet_address FROM users WHERE role = 'notary' LIMIT 1"
        );

        if (result.rows.length === 0) {
            console.log('No notary found');
            process.exit(1);
        }

        const notaryWallet = result.rows[0].wallet_address;
        console.log('Checking balance for:', notaryWallet);

        // Connect to BSC Testnet
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/');

        // NTK Contract
        const ntkAddress = process.env.NTK_CONTRACT_ADDRESS;
        const abi = ["function balanceOf(address) view returns (uint256)"];
        const ntkContract = new ethers.Contract(ntkAddress, abi, provider);

        const balance = await ntkContract.balanceOf(notaryWallet);
        const formattedBalance = ethers.formatUnits(balance, 18);

        console.log('\n📊 NTK Balance:');
        console.log('Raw:', balance.toString());
        console.log('Formatted:', formattedBalance, 'NTK');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkBalance();
