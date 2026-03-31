const { execSync } = require('child_process');
const pool = require('../src/db/index');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function init() {
  console.log('🚀 [DEPLOY_INIT] Starting BBSNS Automated Initialization...');

  try {
    // 1. Run Migrations
    console.log('📦 [1/3] Running Database Migrations...');
    execSync('npm run migrate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

    // 2. Check if Config exists
    console.log('🔍 [2/3] Checking System Configuration...');
    const configRes = await pool.query('SELECT id FROM system_config WHERE id = 1');

    if (configRes.rowCount === 0) {
      console.log('✨ [3/3] Seeding Initial Authoritative Configuration from .env...');
      
      const initialConfig = {
        rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL,
        chainId: parseInt(process.env.CHAIN_ID || "97"),
        contracts: {
          notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
          documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS,
          ntkr: process.env.NTKR_ADDRESS,
          ntk: process.env.NTK_ADDRESS,
          genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS,
          genesisNft: process.env.GENESIS_NFT_ADDRESS,
          multisig: process.env.MULTISIG_ADDRESS
        }
      };

      // Basic validation
      if (!initialConfig.contracts.notaryRegistry || !initialConfig.rpcUrl) {
        throw new Error('CRITICAL CONFIG MISSING: NOTARY_REGISTRY_ADDRESS or RPC_URL not found in .env');
      }

      await pool.query(
        'INSERT INTO system_config (id, config_snapshot, version) VALUES (1, $1, 1)',
        [JSON.stringify(initialConfig)]
      );
      console.log('✅ [SUCCESS] Initial configuration seeded successfully.');
    } else {
      console.log('⏭️ [SKIP] System configuration already exists. No seeding required.');
    }

    console.log('🎉 [DONE] BBSNS is ready for operational use.');
    process.exit(0);
  } catch (err) {
    console.error('❌ [FATAL ERR] Deployment Initialization Failed!');
    console.error(err.message);
    process.exit(1);
  }
}

init();
