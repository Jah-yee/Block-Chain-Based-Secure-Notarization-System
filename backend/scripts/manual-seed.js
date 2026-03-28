const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('🌱 [SEED] Manual Config Seeding for Audit...');
  
  const initialConfig = {
    rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL,
    chainId: parseInt(process.env.CHAIN_ID || '97'),
    contracts: {
      notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS || process.env.NOTARY_REGISTRY_CONTRACT_ADDRESS,
      documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS || process.env.DOCUMENT_REGISTRY_CONTRACT_ADDRESS,
      ntkr: process.env.NTKR_ADDRESS || process.env.NTKR_CONTRACT_ADDRESS,
      ntk: process.env.NTK_ADDRESS || process.env.NTK_CONTRACT_ADDRESS,
      genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS || process.env.GENESIS_ACTIVATION_CONTRACT_ADDRESS,
      genesisNft: process.env.GENESIS_NFT_ADDRESS || process.env.GENESIS_NFT_CONTRACT_ADDRESS,
      multisig: process.env.MULTISIG_ADDRESS || process.env.MULTISIG_CONTRACT_ADDRESS
    }
  };

  try {
    await pool.query('CREATE TABLE IF NOT EXISTS system_config (id INTEGER PRIMARY KEY, config_snapshot JSONB, version INTEGER)');
    await pool.query(
      'INSERT INTO system_config (id, config_snapshot, version) VALUES (1, $1, 1) ON CONFLICT (id) DO UPDATE SET config_snapshot = EXCLUDED.config_snapshot, version = 1',
      [JSON.stringify(initialConfig)]
    );
    console.log('✅ [SUCCESS] system_config seeded with 7 contracts.');
    console.log(JSON.stringify(initialConfig.contracts, null, 2));
  } catch (err) {
    console.error('❌ [ERROR]', err.message);
  } finally {
    await pool.end();
  }
}

run();
