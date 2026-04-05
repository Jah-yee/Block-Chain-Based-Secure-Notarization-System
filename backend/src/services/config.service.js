const pool = require('../db/index');
const { ethers } = require('ethers');
const crypto = require('crypto');

/**
 * 🛡️ CONFIG SERVICE (PHASE 1.5 - HARDENED AUDIT)
 * Responsibility: Definitive, validated, and dynamic source of truth for system config.
 * Rules:
 * - Atomic Read/Write
 * - Fail-Closed Validation (with Structured Error Codes)
 * - Version-Based Cache Safety
 * - Performance-Aware Verification (Timeout Protected)
 */

const CONFIG_ERRORS = {
  EMPTY_DB: 'EMPTY_DB',
  MALFORMED: 'MALFORMED_CONFIG',
  MISSING_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_CHAIN: 'INVALID_CHAIN_ID',
  INVALID_CONTRACT: 'INVALID_CONTRACT_ADDRESS',
  RPC_UNREACHABLE: 'RPC_UNREACHABLE',
  CONTRACT_NOT_FOUND: 'CONTRACT_NOT_FOUND',
  VERIFICATION_TIMEOUT: 'VERIFICATION_TIMEOUT',
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED'
};

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

class ConfigService {
  constructor() {
    this.cache = null;
    this._version = 0;
    this.VERIFICATION_TIMEOUT_MS = 5000; // 5s Fail-Fast SLA
    this.ongoingVerification = null; // 🛡️ Single-Flight Lock
  }

  get currentVersion() {
    return this._version;
  }

  /**
   * 🛡️ getConfig() - THE AUTHORITATIVE READ PATH
   * Ensures valid config or fails closed.
   */
  async getConfig() {
    try {
      // 1. Authoritative Database Fetch (Existence-Based State Gate)
      const res = await pool.query('SELECT config_snapshot, config_version as version, updated_at FROM system_config WHERE id = 1');
      
      let config;
      let version;
      let updatedAt;

      if (!res.rows[0]) {
        // 🛡️ [STATE: BLANK] - Triggering Atomic Seed from Environment (AWS Authority)
        console.log('[CONFIG] No existing configuration found. Attempting atomic seed from AWS authority...');
        
        const initialConfig = this._prepareInitialConfig();
        
        // 🛡️ [GUARD] Binary Completeness Check Before Persistence (7-Contract Schema)
        this.validateCompleteConfig(initialConfig);

        console.log('[CONFIG] 🛡️ Authoritative Genesis Sync Initialized:');
        console.log(`   - RPC: ${initialConfig.rpcUrl} (Chain: ${initialConfig.chainId})`);
        console.log(`   - Notary Registry: ${initialConfig.contracts.notaryRegistry}`);
        console.log(`   - Document Registry: ${initialConfig.contracts.documentRegistry}`);
        console.log(`   - NTKR Reward: ${initialConfig.contracts.ntkr}`);
        console.log(`   - NTK Token: ${initialConfig.contracts.ntk}`);
        console.log(`   - Genesis Act: ${initialConfig.contracts.genesisActivation}`);
        console.log(`   - Genesis NFT: ${initialConfig.contracts.genesisNft}`);
        console.log(`   - Multisig: ${initialConfig.contracts.multisig}`);
        
        // Concurrency-Safe Atomic Seed (Stampede protection)
        await pool.query(
          'INSERT INTO system_config (id, config_snapshot, config_version, is_seeded) VALUES (1, $1, 1, true) ON CONFLICT (id) DO NOTHING',
          [JSON.stringify(initialConfig)]
        );

        // Immediate Re-Fetch (Consistent Truth across all instances)
        const postSeedRes = await pool.query('SELECT config_snapshot, config_version as version, updated_at FROM system_config WHERE id = 1');
        
        if (!postSeedRes.rows[0]) {
          throw this._createError(CONFIG_ERRORS.EMPTY_DB, 'Failed to establish configuration authority after seeding attempt.');
        }

        console.log('✅ [CONFIG] Seed successful. Database initialized and authoritative.');
        config = postSeedRes.rows[0].config_snapshot;
        version = postSeedRes.rows[0].version;
        updatedAt = postSeedRes.rows[0].updated_at;
      } else {
        // 🛡️ [STATE: OPERATIONAL] - Using Database Authority
        console.log('[CONFIG] Existing configuration found. Using Database as authority.');
        config = res.rows[0].config_snapshot;
        version = res.rows[0].version;
        updatedAt = res.rows[0].updated_at;
      }

      // 🛡️ [TIER 1 RISK MITIGATION] Strict Address & State Validation
      this.validateCompleteConfig(config);

      if (this.cache && this._version === version) {
        return this.cache;
      }

      // 2. Connectivity Verification (Soft Check - Warning Only)
      try {
        await this.verifyConnectivity(config);
      } catch (connErr) {
        console.warn(`🛑 [CONFIG_WARN] Connectivity check failed: ${connErr.message}. Serving unverified config to maintain service availability.`);
      }

      // 🛡️ AUTHORITATIVE PRIORITY 
      // Rely solely on the secure database snapshot
      const normalizedConfig = { ...config };
      delete normalizedConfig.config_version; // Purge redundant internal key

      const fullConfig = {
        ...normalizedConfig,
        version,
        updatedAt: (updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt)
      };

      this.cache = {
        ...fullConfig,
        checksum: this.generateChecksum(fullConfig)
      };
      this._version = version;
      
      return this.cache;

    } catch (err) {
      console.error(`❌ [CONFIG_FATAL] System failed to resolve configuration authority. Reason: ${err.message}`);
      throw err; // Strict Fail-Fast Enforcement
    }
  }

  /**
   * 🛡️ updateConfig() - THE AUTHORITATIVE WRITE PATH
   */
  async updateConfig(newConfig, expectedVersion, adminId, reason = 'Administrative Update', source = 'admin') {
    const client = await pool.connect();
    try {
      console.log(`🛡️ [CONFIG_UPDATE] Initiating update from v${expectedVersion} by Admin: ${adminId} via ${source}`);

      this.validateConfig(newConfig, true); // Strict on update
      await this.verifyConnectivity(newConfig);

      await client.query('BEGIN');

      const lockRes = await client.query(
        'SELECT config_snapshot, config_version as version FROM system_config WHERE id = 1 FOR UPDATE'
      );
      
      if (!lockRes.rows[0]) {
        throw this._createError(CONFIG_ERRORS.MALFORMED, 'Attempted to update a non-existent configuration.');
      }

      const currentVersion = lockRes.rows[0].version;
      const currentSnapshot = lockRes.rows[0].config_snapshot;

      if (currentVersion !== Number(expectedVersion)) {
        throw this._createError(CONFIG_ERRORS.CONCURRENCY_CONFLICT, `Current version is ${currentVersion}, but update expected ${expectedVersion}`);
      }

      // Store History with Change Source
      await client.query(
        'INSERT INTO system_config_history (version, config_snapshot, updated_by, change_reason, change_source) VALUES ($1, $2, $3, $4, $5)',
        [currentVersion, JSON.stringify(currentSnapshot), adminId, reason, source]
      );

      const newVersion = currentVersion + 1;
      await client.query(
        'UPDATE system_config SET config_snapshot = $1, config_version = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
        [JSON.stringify(newConfig), newVersion, adminId]
      );

      await client.query('COMMIT');
      
      this.cache = newConfig;
      this._version = newVersion;

      console.log(`✅ [CONFIG_UPDATE_SUCCESS] Active version is now: ${newVersion}`);
      return { success: true, version: newVersion };

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rollbackConfig(targetVersion, adminId) {
    const historyRes = await pool.query(
      'SELECT config_snapshot FROM system_config_history WHERE version = $1',
      [targetVersion]
    );

    if (historyRes.rowCount === 0) {
      throw this._createError(CONFIG_ERRORS.ROLLBACK_FAILED, `Version ${targetVersion} not found in history`);
    }

    const targetConfig = historyRes.rows[0].config_snapshot;
    const currentRes = await pool.query('SELECT config_version as version FROM system_config WHERE id = 1');
    return this.updateConfig(targetConfig, currentRes.rows[0].version, adminId, `Rollback to version ${targetVersion}`);
  }

  /**
   * 🛡️ validateCompleteConfig() - Binary Completeness Guard
   * Throws FATAL on format error, missing field, or placeholder (0x0).
   */
  validateCompleteConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      throw this._createError(CONFIG_ERRORS.MALFORMED, 'Configuration object is missing or malformed.');
    }

    const requiredKeys = ['rpcUrl', 'chainId', 'contracts'];
    for (const key of requiredKeys) {
      if (!cfg[key]) throw this._createError(CONFIG_ERRORS.MISSING_FIELD, `Mandatory field [${key}] missing from authority.`);
    }

    const contracts = [
      'notaryRegistry', 
      'documentRegistry', 
      'ntkr', 
      'ntk', 
      'genesisActivation', 
      'genesisNft', 
      'multisig'
    ];
    const isValidAddr = (addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);

    for (const key of contracts) {
      const addr = cfg.contracts[key];
      if (!addr) {
        throw this._createError(CONFIG_ERRORS.MISSING_FIELD, `Genesis Contract [${key}] not present in authority schema.`);
      }
      
      if (!isValidAddr(addr)) {
        throw this._createError(CONFIG_ERRORS.INVALID_CONTRACT, `Genesis Contract [${key}] has invalid format: ${addr}`);
      }

      if (addr === "0x0000000000000000000000000000000000000000") {
        throw this._createError(CONFIG_ERRORS.INVALID_CONTRACT, `Genesis Contract [${key}] set to zero-address placeholder in production auth.`);
      }
    }

    return true;
  }

  /**
   * 🛡️ validateConfig() - Strict internal validation with Error Codes (Legacy/Updates)
   */
  validateConfig(config, strict = true) {
    if (!config || typeof config !== 'object') {
      if (!strict) return false;
      throw this._createError(CONFIG_ERRORS.MALFORMED, 'Config missing or malformed');
    }
    
    const required = ['rpcUrl', 'chainId', 'contracts'];
    for (const field of required) {
      if (!config[field]) {
        if (!strict) return false;
        throw this._createError(CONFIG_ERRORS.MISSING_FIELD, `Missing required field: ${field}`);
      }
    }

    const expectedChainId = parseInt(process.env.CHAIN_ID || "97");
    if (Number(config.chainId) !== expectedChainId && strict) {
      throw this._createError(CONFIG_ERRORS.INVALID_CHAIN, `Expected ${expectedChainId}, but snapshot has ${config.chainId}`);
    }

    const criticalContracts = [
      'notaryRegistry', 
      'documentRegistry', 
      'ntkr', 
      'ntk', 
      'genesisActivation', 
      'genesisNft', 
      'multisig'
    ];
    for (const contract of criticalContracts) {
      const addr = config.contracts[contract];
      const isValidAddr = /^0x[a-fA-F0-9]{40}$/.test(addr);
      
      if (!isValidAddr) {
        if (!strict) return false;
        throw this._createError(CONFIG_ERRORS.INVALID_CONTRACT, `Invalid address for ${contract}: ${addr}`);
      }
      
      if (strict && addr === "0x0000000000000000000000000000000000000000") {
          throw this._createError(CONFIG_ERRORS.INVALID_CONTRACT, `Cannot use zero address for ${contract} in production.`);
      }
    }

    return true;
  }

  /**
   * 🛡️ verifyConnectivity() - Live pre-activation check with TIMEOUT protection
   */
  async verifyConnectivity(config) {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(this._createError(CONFIG_ERRORS.VERIFICATION_TIMEOUT, `Verification timed out after ${this.VERIFICATION_TIMEOUT_MS}ms`));
      }, this.VERIFICATION_TIMEOUT_MS);
    });

    try {
      const checkAction = (async () => {
        try {
          // 1. Validate Chain connection
          const network = await provider.getNetwork();
          if (Number(network.chainId) !== Number(config.chainId)) {
            throw this._createError(CONFIG_ERRORS.INVALID_CHAIN, `RPC chainId (${network.chainId}) != Config chainId (${config.chainId})`);
          }
          
          // 2. Verify Bytecode at critical address (Skip if zero address)
          if (config.contracts.notaryRegistry !== "0x0000000000000000000000000000000000000000") {
            const code = await provider.getCode(config.contracts.notaryRegistry);
            if (code === '0x' || code === '0x0') {
              throw this._createError(CONFIG_ERRORS.CONTRACT_NOT_FOUND, `No contract at NotaryRegistry: ${config.contracts.notaryRegistry}`);
            }
          }
          return true;
        } catch (innerErr) {
          // Map network-level errors to structured codes
          if (innerErr.code === 'ENOTFOUND' || innerErr.code === 'ECONNREFUSED' || innerErr.code === 'ETIMEDOUT') {
            throw this._createError(CONFIG_ERRORS.RPC_UNREACHABLE, `Network Failure: ${innerErr.code} - ${innerErr.message}`);
          }
          if (innerErr.code) throw innerErr; // Already structured
          throw this._createError(CONFIG_ERRORS.RPC_UNREACHABLE, innerErr.message);
        }
      })();

      const result = await Promise.race([checkAction, timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timer); 
    }
  }

  /**
   * 🛡️ _prepareInitialConfig() - Internal Helper
   * Merges authoritative environment secrets into the initial DB configuration snapshot.
   */
  _prepareInitialConfig() {
    return {
      rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL,
      chainId: parseInt(process.env.CHAIN_ID || "97"),
      apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000",
      webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",
      remoteAuthUrl: process.env.REMOTE_AUTH_URL || "http://localhost:3002",
      contracts: {
        notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
        documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS,
        ntkr: process.env.NTKR_CONTRACT_ADDRESS,
        ntk: process.env.NTK_CONTRACT_ADDRESS,
        genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS,
        genesisNft: process.env.GENESIS_NFT_ADDRESS,
        multisig: process.env.MULTISIG_CONTRACT_ADDRESS
      }
    };
  }

  /**
   * 🛡️ normalizeConfig() - Identical structure for both Backend and Frontend
   * Responsibility: Ensure deterministic types and fields before hashing.
   */
  normalizeConfig(config) {
    if (!config || typeof config !== 'object' || config === null) return config;

    const normalized = {};
    const keys = Object.keys(config).sort();

    for (const key of keys) {
      let value = config[key];

      // 🛡️ Edge Case 1: Drop undefined, null, and excluded security fields
      if (value === undefined || value === null) continue;
      if (key === 'checksum' || key === 'signature') continue;

      // 🛡️ Edge Case 2: Standardize Dates
      if (value instanceof Date) {
        value = value.toISOString();
      }

      // 🛡️ Edge Case 3: Recursive Normalize for Objects
      if (typeof value === 'object' && !(value instanceof Date)) {
        value = this.normalizeConfig(value);
      }

      // 🛡️ Edge Case 4: Explicit Type Casting for known numeric fields
      if (['version', 'config_version', 'chainId'].includes(key)) {
        value = Number(value);
      }

      normalized[key] = value;
    }

    return normalized;
  }

  /**
   * 🛡️ deepSort() - Deterministic recursive sorting
   */
  deepSort(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSort(item));
    } else if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.deepSort(obj[key]);
          return acc;
        }, {});
    }
    return obj;
  }

  generateChecksum(config) {
    const salt = process.env.CONFIG_CHECKSUM_SALT || 'bbsns_prod_secure_2026';
    
    // 🛡️ 1. Normalize and Sort (Deterministic Mirroring)
    const normalized = this.normalizeConfig(config);
    const sorted = this.deepSort(normalized);
    
    // 🛡️ 2. Deterministic Stringification
    const data = JSON.stringify(sorted);
    
    // 🛡️ 3. Double-Truth Logging
    const checksum = crypto.createHmac('sha256', salt).update(data, 'utf8').digest('hex');
    
    console.log("--- 🛡️ CONFIG CHECKSUM GENERATED ---");
    console.log("BACKEND_STRING:", data);
    console.log("BACKEND_HASH:", checksum);
    console.log("------------------------------------");

    return checksum;
  }

  _createError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }
}

module.exports = new ConfigService();
module.exports.CONFIG_ERRORS = CONFIG_ERRORS;
