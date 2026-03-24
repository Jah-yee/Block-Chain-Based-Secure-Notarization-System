const { mintDailyNTK } = require('./src/blockchain/tokens');
const pool = require('./src/db/index');

async function debugMinting() {
    try {
        console.log('🔍 Debugging NTK minting...\n');

        // Get notary info
        const result = await pool.query(
            "SELECT id, email, wallet_address, kyc_verified FROM users WHERE role = 'notary' LIMIT 1"
        );

        if (result.rows.length === 0) {
            console.log('❌ No notaries found');
            process.exit(1);
        }

        const notary = result.rows[0];
        console.log('Notary:', notary);
        console.log('KYC Verified:', notary.kyc_verified);
        console.log('\n📡 Attempting to mint NTK...\n');

        try {
            const txHash = await mintDailyNTK(notary.wallet_address, notary.id);
            console.log('\n✅ SUCCESS!');
            console.log('Transaction Hash:', txHash);
            console.log('Check on explorer: https://testnet.bscscan.com/tx/' + txHash);
        } catch (err) {
            console.log('\n❌ MINTING FAILED');
            console.log('Error:', err.message);
            console.log('\nFull error:');
            console.log(err);
        }

        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

debugMinting();
