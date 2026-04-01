const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db/index');

/**
 * 🛡️ StartupGuard - MIGRATION INTEGRITY & SCHEMA ENFORCEMENT
 * Protects the BBSNS system from running on an inconsistent or mismatched database.
 */
class StartupGuard {
  static async verifyEnvironmentVars() {
    console.log('   - 🛡️ StartupGuard: Auditing Environment Variables...');
    const criticalVars = [
      'DATABASE_URL', 
      'JWT_SECRET', 
      'CHAIN_ID', 
      'AWS_S3_BUCKET', 
      'AWS_REGION', 
      'WEB_APP_URL'
    ];
    
    const missing = criticalVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      console.error(`❌ [GUARD_FATAL] Missing required environment variables: ${missing.join(', ')}`);
      console.error('👉 Please check your .env file or EC2 environment parameters.');
      process.exit(1);
    }
  }

  static async verifyMigrationIntegrity() {
    console.log('   - 🛡️ StartupGuard: Auditing Migration Integrity...');
    
    const migrationsDir = path.join(__dirname, '../../migrations');
    const localFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
      .sort();

    const localMigrationHashes = localFiles.map(filename => {
      const content = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return { filename, hash };
    });

    try {
      // 1. Check if pg_migrations table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'pgmigrations'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        if (localFiles.length > 0) {
          console.warn('   ⚠️ [GUARD_WARN] Database is empty but local migrations exist.');
          // In strict production, we might want to fail here, 
          // but for first-time setup we allow it so 'migrate' can run.
          return;
        }
        return;
      }

      // 2. Fetch applied migrations
      // node-pg-migrate uses 'name' and 'run_on'
      const { rows: appliedMigrations } = await pool.query('SELECT name FROM pgmigrations ORDER BY name ASC');

      const appliedNames = appliedMigrations.map(m => m.name);
      
      // 3. Strict Parity Check
      if (appliedNames.length > localFiles.length) {
        console.error(`❌ [GUARD_FATAL] Database is AHEAD of code. Applied: ${appliedNames.length}, Local: ${localFiles.length}`);
        process.exit(1);
      }

      // 4. Content Integrity Check (Verified against applied subset)
      for (let i = 0; i < appliedNames.length; i++) {
        const appliedName = appliedNames[i];
        const localName = localFiles[i].replace(/\.(js|sql)$/, '');

        if (appliedName !== localName) {
          console.error(`❌ [GUARD_FATAL] Migration sequence mismatch at index ${i}. Expected: ${localName}, Found in DB: ${appliedName}`);
          process.exit(1);
        }
        
        // Note: node-pg-migrate doesn't store hashes by default. 
        // For v1, we enforce NAME parity. Future versions can store/verify hashes in a custom table.
      }

      console.log(`   ✅ Migration Integrity Verified (${appliedNames.length} consistent records).`);
    } catch (err) {
      console.error('❌ [GUARD_FATAL] Failed to verify migration integrity:', err.message);
      process.exit(1);
    }
  }

  static async verifyBlockchainContext() {
    const { ethers } = require('ethers');
    const ConfigService = require('./config.service');
    
    try {
      const config = await ConfigService.getConfig();
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const expectedChainId = Number(config.chainId || process.env.CHAIN_ID || 97);

      if (chainId !== expectedChainId) {
        console.error(`❌ [GUARD_FATAL] Chain ID Mismatch. Network (RPC): ${chainId}, Application (Expected): ${expectedChainId}`);
        console.error(`👉 Solution: Correct the CHAIN_ID in .env or point to the correct RPC endpoint.`);
        process.exit(1);
      }
      console.log(`   ✅ Blockchain Context Verified (Chain ID: ${chainId}).`);
    } catch (err) {
       console.error('❌ [GUARD_FATAL] Failed to verify blockchain context:', err.message);
       process.exit(1);
    }
  }
}

module.exports = StartupGuard;
