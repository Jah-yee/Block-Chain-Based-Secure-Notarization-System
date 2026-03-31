const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env explicitly
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

async function seed() {
  console.log('🛡️ [GUARDIAN] Initiating Atomic Configuration Seeding...');
  
  try {
    // 1. Build authoritative snapshot from .env
    const configSnapshot = {
      rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL,
      chainId: Number(process.env.CHAIN_ID) || 97,
      contracts: {
        notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
        documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS,
        ntkr: process.env.NTKR_CONTRACT_ADDRESS,
        ntk: process.env.NTK_CONTRACT_ADDRESS,
        multisig: process.env.MULTISIG_CONTRACT_ADDRESS,
        genesisNft: process.env.GENESIS_NFT_ADDRESS,
        genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS
      }
    };

    // 2. Validate Snapshot (Atomicity Rule)
    console.log('🛡️ [GUARDIAN] Validating Snapshot...');
    if (!configSnapshot.rpcUrl) throw new Error('Missing RPC_URL in .env');
    if (!configSnapshot.contracts.notaryRegistry) throw new Error('Missing NOTARY_REGISTRY_ADDRESS in .env');
    
    // 3. Update Database (Atomic Bootstrap Rule)
    const sql = `
      UPDATE system_config 
      SET config_snapshot = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING version;
    `;
    
    const res = await pool.query(sql, [JSON.stringify(configSnapshot)]);
    
    if (res.rowCount === 0) {
      throw new Error('system_config table row id=1 not found. Ensure migration ran.');
    }

    console.log('✅ [GUARDIAN] Seeding Successful. Version:', res.rows[0].version);
    console.log('🛡️ [GUARDIAN] Authoritative Config:', JSON.stringify(configSnapshot, null, 2));

  } catch (err) {
    console.error('❌ [GUARDIAN] Seeding Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
