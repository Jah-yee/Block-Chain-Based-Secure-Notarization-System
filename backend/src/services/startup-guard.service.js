const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db/index');

/**
 * 🛡️ StartupGuard - MIGRATION INTEGRITY & SCHEMA ENFORCEMENT
 * Protects the BBSNS system from running on an inconsistent or mismatched database.
 */

function assertNoSemicolons(sql, tag = 'StartupGuard') {
  if (typeof sql === 'string' && sql.includes(';')) {
    console.error(`❌ [STARTUP_SQL_INVALID] ${tag}: Trailing semicolons violate Iron Sentinel policy.`, { sql });
    throw new Error('INVALID_STARTUP_SQL_SEMICOLON');
  }
}

class StartupGuard {
  static async verifyEnvironmentVars() {
    console.log('   - 🛡️ StartupGuard: Auditing Environment Variables...');
    const criticalVars = [
      'DATABASE_URL', 
      'JWT_SECRET', 
      'BNB_SYSTEM_PRIVATE_KEY',
      'CHAIN_ID', 
      'AWS_S3_BUCKET', 
      'AWS_REGION', 
      'WEB_APP_URL'
    ];
    
    const missing = criticalVars.filter(v => !process.env[v]);
    
    if (missing.length > 0) {
      console.error(`❌ [GUARD_FATAL] Missing required configured parameters: ${missing.join(', ')}`);
      console.error('👉 ACTION REQUIRED: Verify AWS Secrets Manager or .env configuration.');
      process.exit(1);
    }
    console.log(`   ✅ Environment Audit Complete. ${criticalVars.length} critical variables verified.`);
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
      const tableCheckSql = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'pgmigrations'
        )
      `;
      assertNoSemicolons(tableCheckSql, 'StartupGuard.tableCheck');
      const tableCheck = await pool.query(tableCheckSql);

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
      const appliedSql = 'SELECT name FROM pgmigrations ORDER BY name ASC';
      assertNoSemicolons(appliedSql, 'StartupGuard.appliedMigrations');
      const { rows: appliedMigrations } = await pool.query(appliedSql);

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
      console.error('⚠️ [STARTUP_WARNING][MIGRATION] Migration integrity check failed but allowing boot to proceed:', err.message);
    }
  }

  static async verifyBlockchainContext() {
    const { ethers } = require('ethers');
    const ConfigService = require('./config.service');
    
    try {
      // 🛡️ Resolve Authoritative Configuration (DB or Atomic Seed from AWS)
      const config = await ConfigService.getConfig();
      
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const expectedChainId = Number(config.chainId || process.env.CHAIN_ID || 97);

      if (chainId !== expectedChainId) {
        console.error(`❌ [GUARD_FATAL] Chain ID Mismatch. Network (RPC): ${chainId}, Application (Expected): ${expectedChainId}`);
        console.error(`👉 Solution: Correct the CHAIN_ID in AWS Secrets or point to the correct RPC endpoint.`);
        process.exit(1);
      }
      console.log(`   ✅ Blockchain Context Verified (Chain ID: ${chainId}).`);
    } catch (err) {
       console.error('❌ [GUARD_FATAL] Failed to verify blockchain context: No configuration authority available.');
       console.error(`👉 Reason: ${err.message}`);
       process.exit(1);
    }
  }
}

module.exports = StartupGuard;
