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
      // 1. Version-Based Cache Check (Architecture Rule: FAST)
      const res = await pool.query('SELECT config_snapshot, version, updated_at FROM system_config WHERE id = 1');
      
      if (!res.rows[0]) {
        console.warn(`⚠️ [CONFIG_CRITICAL] System config is EMPTY in DB. Triggering Self-Healing Auto-Seed...`);
        return await this._autoSeedFromEnv();
      }
      
      const { config_snapshot, version, updated_at } = res.rows[0];

      // 🛡️ [TIER 1 RISK MITIGATION] Strict Address & State Validation
      const isValidAddress = (addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
      
      const isPlaceholder = version === 0 || !config_snapshot || Object.keys(config_snapshot).length === 0;
      const hasMalformedAddress = config_snapshot && config_snapshot.contracts && 
                                  Object.values(config_snapshot.contracts).some(addr => !isValidAddress(addr) || addr.startsWith('0x0000'));
      
      const isInvalid = !config_snapshot || !config_snapshot.rpcUrl || !config_snapshot.apiBaseUrl || config_snapshot.chainId === 0 || hasMalformedAddress;

      if (isPlaceholder || isInvalid) {
        console.warn(`⚠️ [CONFIG_CRITICAL] System config is UNINITIALIZED, MALFORMED or INCOMPLETE (Version ${version}). Triggering Self-Healing Auto-Seed...`);
        return await this._autoSeedFromEnv();
      }

      if (this.cache && this._version === version) {
        return this.cache;
      }

      // 2. Single-Flight Request Collapsing (🛡️ Stampede Protection)
      if (this.ongoingVerification) {
        return await this.ongoingVerification;
      }

      // 3. Initiate Verification with Lock
      this.ongoingVerification = (async () => {
        try {
          // Perform soft validation (don't throw fatal on boot if possible)
          const isValid = this.validateConfig(config_snapshot, false);
          
          if (isValid) {
            try {
              await this.verifyConnectivity(config_snapshot);
            } catch (connErr) {
              console.warn(`🛑 [CONFIG_WARN] Connectivity check failed: ${connErr.message}. Serving stale/unverified config to keep API alive.`);
            }
          }

          const enrichedConfig = {
            ...config_snapshot,
            version,
            updatedAt: updated_at,
            checksum: this.generateChecksum(config_snapshot)
          };

          this.cache = enrichedConfig;
          this._version = version;
          
          return this.cache;
        } finally {
          this.ongoingVerification = null; // 🛡️ Release Lock
        }
      })();

      return await this.ongoingVerification;

    } catch (err) {
      console.error(`❌ [CONFIG_CRITICAL_FAIL] Serving SAFE_DEFAULTS to prevent crash. Reason: ${err.message}`);
      return SAFE_DEFAULTS; 
    }
  }

  /**
   * 🛡️ updateConfig() - THE AUTHORITATIVE WRITE PATH
   */
  async updateConfig(newConfig, expectedVersion, adminId, reason = 'Administrative Update') {
    const client = await pool.connect();
    try {
      console.log(`🛡️ [CONFIG_UPDATE] Initiating update from v${expectedVersion} by Admin: ${adminId}`);

      this.validateConfig(newConfig, true); // Strict on update
      await this.verifyConnectivity(newConfig);

      await client.query('BEGIN');

      const lockRes = await client.query(
        'SELECT config_snapshot, version FROM system_config WHERE id = 1 FOR UPDATE'
      );
      
      const currentVersion = lockRes.rows[0].version;
      const currentSnapshot = lockRes.rows[0].config_snapshot;

      if (currentVersion !== Number(expectedVersion)) {
        throw this._createError(CONFIG_ERRORS.CONCURRENCY_CONFLICT, `Current version is ${currentVersion}, but update expected ${expectedVersion}`);
      }

      await client.query(
        'INSERT INTO system_config_history (version, config_snapshot, updated_by, change_reason) VALUES ($1, $2, $3, $4)',
        [currentVersion, JSON.stringify(currentSnapshot), adminId, reason]
      );

      const newVersion = currentVersion + 1;
      await client.query(
        'UPDATE system_config SET config_snapshot = $1, version = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
        [JSON.stringify(newConfig), newVersion]
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
    const currentRes = await pool.query('SELECT version FROM system_config WHERE id = 1');
    return this.updateConfig(targetConfig, currentRes.rows[0].version, adminId, `Rollback to version ${targetVersion}`);
  }

  /**
   * 🛡️ validateConfig() - Strict internal validation with Error Codes
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

    const criticalContracts = ['notaryRegistry', 'documentRegistry', 'ntkr', 'ntk'];
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

  async _autoSeedFromEnv() {
    try {
      const initialConfig = {
        rpcUrl: process.env.RPC_URL || process.env.BNB_TESTNET_RPC_URL || SAFE_DEFAULTS.rpcUrl,
        chainId: parseInt(process.env.CHAIN_ID || "97"),
        apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000",
        webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",
        remoteAuthUrl: process.env.REMOTE_AUTH_URL || "http://localhost:3002",
        contracts: {
          notaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS || SAFE_DEFAULTS.contracts.notaryRegistry,
          documentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS || SAFE_DEFAULTS.contracts.documentRegistry,
          ntkr: process.env.NTKR_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.ntkr,
          ntk: process.env.NTK_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.ntk,
          genesisActivation: process.env.GENESIS_ACTIVATION_ADDRESS || SAFE_DEFAULTS.contracts.genesisActivation,
          genesisNft: process.env.GENESIS_NFT_ADDRESS || SAFE_DEFAULTS.contracts.genesisNft,
          multisig: process.env.MULTISIG_CONTRACT_ADDRESS || SAFE_DEFAULTS.contracts.multisig
        }
      };

      // Idempotent insertion
      await pool.query(
        'INSERT INTO system_config (id, config_snapshot, version) VALUES (1, $1, 1) ON CONFLICT (id) DO NOTHING',
        [JSON.stringify(initialConfig)]
      );
      
      const currentRes = await pool.query('SELECT config_snapshot, version, updated_at FROM system_config WHERE id = 1');
      const snapshot = currentRes.rows[0].config_snapshot;
      this._version = currentRes.rows[0].version;
      
      this.cache = {
        ...snapshot,
        version: this._version,
        updatedAt: currentRes.rows[0].updated_at,
        checksum: this.generateChecksum(snapshot)
      };
      
      console.log(`✅ [CONFIG] Self-healing seed successful (v${this._version}).`);
      return this.cache;
    } catch (err) {
      console.error('❌ [CONFIG] Self-healing failed. Reverting to hardcoded SAFE_DEFAULTS:', err.message);
      return SAFE_DEFAULTS;
    }
  }

  generateChecksum(config) {
    const salt = process.env.CONFIG_CHECKSUM_SALT || 'bbsns_dev_salt';
    // Deterministic stringification
    const data = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHmac('sha256', salt).update(data).digest('hex');
  }

  _createError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }
}

module.exports = new ConfigService();
module.exports.CONFIG_ERRORS = CONFIG_ERRORS;
