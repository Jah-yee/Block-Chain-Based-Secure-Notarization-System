const { execSync } = require('child_process');
const pool = require('../src/db/index');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

function isValidAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

async function init() {
  try {
    // 🔍 1. DB Connectivity Check
    console.log('🔗 [1/5] Verifying Database Connectivity...');
    await pool.query('SELECT 1');

    // 📦 2. Migration Safety Layer (Primary: node-pg-migrate | Fallback: bootstrap-db.js)
    console.log('📦 [2/5] Initializing Database Schema...');
    try {
      const migratePath = path.join(__dirname, '../node_modules/node-pg-migrate/bin/node-pg-migrate');
      execSync(`"${process.execPath}" "${migratePath}" up`, { 
        stdio: 'inherit', 
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
      });
    } catch (migrateErr) {
      console.warn('⚠️ [MIGRATE_WARN] node-pg-migrate failed. Activating Atomic Bootstrap Fallback...');
      const bootstrapPath = path.join(__dirname, 'bootstrap-db.js');
      execSync(`"${process.execPath}" "${bootstrapPath}"`, { 
        stdio: 'inherit', 
        cwd: __dirname,
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
      });
    }

    // 🔬 3. Schema Consistency Check (Tier 1 Risk Mitigation)
    console.log('🔬 [3/5] Verifying Schema Consistency...');
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'documents', 'system_config', 'governance_proposals')
    `);
    if (tablesRes.rowCount < 4) {
      console.error('❌ [SCHEMA_INCONSISTENT] Core tables are missing despite migration attempt. Possible partial state.');
      process.exit(1);
    }

    // 🔍 4. Seeding Validation (Deep Integrity Check)
    console.log('🔍 [4/5] Validating Authoritative Configuration...');
    const configRes = await pool.query('SELECT version, config_snapshot FROM system_config WHERE id = 1');
    
    let needsBootstrap = configRes.rowCount === 0;
    if (!needsBootstrap) {
      const { version, config_snapshot } = configRes.rows[0];
      const isPlaceholder = version === 0 || !config_snapshot || Object.keys(config_snapshot).length === 0;
      
      // Strict Address Validation
      const hasInvalidAddress = config_snapshot.contracts && Object.values(config_snapshot.contracts).some(addr => !isValidAddress(addr) || addr.startsWith('0x0000'));
      const isInvalid = !config_snapshot || !config_snapshot.rpcUrl || config_snapshot.chainId === 0 || hasInvalidAddress;
      
      if (isPlaceholder || isInvalid) {
        console.warn(`⚠️ [CONFIG_WARN] Existing configuration is invalid or placeholder (Version ${version}). Forcing RE-SEED...`);
        needsBootstrap = true;
      }
    }

    if (needsBootstrap) {
      console.log('✨ [5/5] Executing Authoritative Configuration Seed...');
      
      const SAFE_DEFAULTS = {
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
        chainId: 97,
        contracts: {
          notaryRegistry: "0x0000000000000000000000000000000000000000",
          documentRegistry: "0x0000000000000000000000000000000000000000",
          ntkr: "0x0000000000000000000000000000000000000000",
          ntk: "0x0000000000000000000000000000000000000000",
          genesisActivation: "0x0000000000000000000000000000000000000000",
          genesisNft: "0x0000000000000000000000000000000000000000",
          multisig: "0x0000000000000000000000000000000000000000"
        }
      };

      const initialConfig = {
        rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL || SAFE_DEFAULTS.rpcUrl,
        chainId: parseInt(process.env.CHAIN_ID || "97"),
        contracts: {
          notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS || process.env.NOTARY_REGISTRY_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.notaryRegistry,
          documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS || process.env.DOCUMENT_REGISTRY_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.documentRegistry,
          ntkr: process.env.NTKR_ADDRESS || process.env.NTKR_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.ntkr,
          ntk: process.env.NTK_ADDRESS || process.env.NTK_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.ntk,
          genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS || process.env.GENESIS_ACTIVATION_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.genesisActivation,
          genesisNft: process.env.GENESIS_NFT_ADDRESS || process.env.GENESIS_NFT_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.genesisNft,
          multisig: process.env.MULTISIG_ADDRESS || process.env.MULTISIG_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.multisig
        }
      };

      // Final Sanity Guard: Never seed garbage addresses
      const seededAddresses = Object.values(initialConfig.contracts);
      if (seededAddresses.some(addr => !isValidAddress(addr))) {
         console.warn('🚨 [CRITICAL_SEED_FAIL] Seeding blocked: One or more env addresses are MALFORMED. Check .env');
         process.exit(1);
      }

      await pool.query(
        'INSERT INTO system_config (id, config_snapshot, version) VALUES (1, $1, 1) ON CONFLICT (id) DO UPDATE SET config_snapshot = EXCLUDED.config_snapshot, version = 1',
        [JSON.stringify(initialConfig)]
      );
      console.log('✅ [SUCCESS] Initial configuration seeded securely.');
      await checkContractReality(initialConfig);
    } else {
      console.log('⏭️ [SKIP] System configuration already exists and is valid.');
      await checkContractReality(configRes.rows[0].config_snapshot);
    }

    console.log('🎉 [DONE] BBSNS is ready for operational use.');
    process.exit(0);
  } catch (err) {
    console.error('❌ [DEPLOY_INIT_FATAL] Initialization failed:', err.message);
    process.exit(1); 
  }
}

async function checkContractReality(config) {
  console.log('🌐 [REALITY] Verifying Contract Existence via RPC (eth_getCode)...');
  const results = [];
  for (const [name, address] of Object.entries(config.contracts)) {
    if (address.startsWith('0x0000')) continue;
    try {
      const curlCmd = `curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_getCode","params":["${address}","latest"],"id":1}' "${config.rpcUrl}"`;
      const output = execSync(curlCmd).toString();
      const data = JSON.parse(output);
      
      const hasCode = data.result && data.result !== '0x' && data.result !== '0x0';
      results.push({ name, address, hasCode });
      
      if (!hasCode) {
        console.warn(`🚨 [CRITICAL_REALITY_FAIL] Contract ${name} (${address}) has NO BYTECODE on-chain!`);
      } else {
        console.log(`✅ [REALITY_PASS] ${name} verified (Code Length: ${data.result.length - 2} chars).`);
      }
    } catch (err) {
      console.error(`⚠️ [REALITY_ERROR] Could not verify ${name}:`, err.message);
    }
  }
  return results;
}

init();
