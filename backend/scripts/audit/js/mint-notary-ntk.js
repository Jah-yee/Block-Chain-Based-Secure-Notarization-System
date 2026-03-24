const pool = require('./src/db/index');
const { mintDailyNTK } = require('./src/blockchain/tokens');

async function mintForNotaries() {
    try {
        const result = await pool.query(
            "SELECT id, email, wallet_address, role, kyc_verified FROM users WHERE role = 'notary'"
        );

        console.log(`Found ${result.rows.length} notaries:`);
        console.log(JSON.stringify(result.rows, null, 2));

        for (const notary of result.rows) {
            if (!notary.kyc_verified) {
                console.log(`⏭️  Skipping ${notary.email} - KYC not verified`);
                continue;
            }

            try {
                const txHash = await mintDailyNTK(notary.wallet_address, notary.id);
                console.log(`✅ Minted 100 NTK for ${notary.email}: ${txHash}`);
            } catch (err) {
                console.error(`❌ Failed for ${notary.email}:`, err.message);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

mintForNotaries();
