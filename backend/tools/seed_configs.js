const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function seedConfigs() {
    console.log(`🚀 Seeding Authority Snapshot to ${process.env.DATABASE_URL}...`);
    
    const snapshot = {
        rpcUrl: process.env.BNB_TESTNET_RPC_URL,
        chainId: process.env.CHAIN_ID,
        contracts: {
          ntkr: process.env.NTKR_CONTRACT_ADDRESS,
          ntk: process.env.NTK_CONTRACT_ADDRESS,
          multisig: process.env.MULTISIG_CONTRACT_ADDRESS,
          notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
          documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS,
          genesisNft: process.env.GENESIS_NFT_ADDRESS,
          genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS
        }
    };

    try {
        await pool.query('BEGIN');
        
        // Ensure tables exist (migration should have created them, but defensive)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                config_snapshot JSONB NOT NULL,
                version INTEGER DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(
            `INSERT INTO system_config (id, config_snapshot, version) 
             VALUES (1, $1, 1) 
             ON CONFLICT (id) DO UPDATE SET config_snapshot = EXCLUDED.config_snapshot, updated_at = NOW()`,
            [snapshot]
        );

        await pool.query('COMMIT');
        console.log('✅ Authority Snapshot Seeded Successfully.');
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Seeding Failed:', err.message);
    } finally {
        await pool.end();
    }
}

seedConfigs();
