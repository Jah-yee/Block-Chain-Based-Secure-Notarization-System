const pool = require('../db/index');
const { ethers } = require('ethers');

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
      const res = await pool.query('SELECT config_snapshot, version FROM system_config WHERE id = 1');
      
      if (res.rowCount === 0) {
        console.log('✨ [CONFIG] System config empty. Attempting auto-seed from .env...');
        return await this._autoSeedFromEnv();
      }

      const { config_snapshot, version } = res.rows[0];

      if (this.cache && this._version === version) {
        return this.cache;
      }

      // 2. Single-Flight Request Collapsing (🛡️ Stampede Protection)
      if (this.ongoingVerification) {
        console.log(`🛡️ [CONFIG] Awaiting ongoing verification for version: ${version}...`);
        return await this.ongoingVerification;
      }

      // 3. Initiate Verification with Lock
      this.ongoingVerification = (async () => {
        try {
          console.log(`🛡️ [CONFIG] Initiating FRESH verification for version: ${version}`);
          
          this.validateConfig(config_snapshot);
          await this.verifyConnectivity(config_snapshot);

          this.cache = config_snapshot;
          this._version = version;
          
          return this.cache;
        } finally {
          this.ongoingVerification = null; // 🛡️ Release Lock
        }
      })();

      return await this.ongoingVerification;

    } catch (err) {
      console.error(`❌ [CONFIG_FAIL] Code: ${err.code || 'UNKNOWN'}, Message: ${err.message}`);
      throw err; // Fail Closed
    }
  }

  /**
   * 🛡️ updateConfig() - THE AUTHORITATIVE WRITE PATH
   */
  async updateConfig(newConfig, expectedVersion, adminId, reason = 'Administrative Update') {
    const client = await pool.connect();
    try {
      console.log(`🛡️ [CONFIG_UPDATE] Initiating update from v${expectedVersion} by Admin: ${adminId}`);

      this.validateConfig(newConfig);
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
  validateConfig(config) {
    if (!config || typeof config !== 'object') throw this._createError(CONFIG_ERRORS.MALFORMED, 'Config missing or malformed');
    
    const required = ['rpcUrl', 'chainId', 'contracts'];
    required.forEach(field => {
      if (!config[field]) throw this._createError(CONFIG_ERRORS.MISSING_FIELD, `Missing required field: ${field}`);
    });

    if (Number(config.chainId) !== 97) {
      throw this._createError(CONFIG_ERRORS.INVALID_CHAIN, `Expected 97, but snapshot has ${config.chainId}`);
    }

    const criticalContracts = ['notaryRegistry', 'documentRegistry', 'ntkr', 'ntk'];
    criticalContracts.forEach(contract => {
      const addr = config.contracts[contract];
      if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        throw this._createError(CONFIG_ERRORS.INVALID_CONTRACT, `Invalid address for ${contract}: ${addr}`);
      }
    });

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
          
          // 2. Verify Bytecode at critical address
          const code = await provider.getCode(config.contracts.notaryRegistry);
          if (code === '0x' || code === '0x0') {
            throw this._createError(CONFIG_ERRORS.CONTRACT_NOT_FOUND, `No contract at NotaryRegistry: ${config.contracts.notaryRegistry}`);
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
      clearTimeout(timer); // 🛡️ Prevent timer from hanging the process
      // Note: provider.destroy() doesn't exist for JsonRpcProvider, but handles will close on GC
    }
  }

  async _autoSeedFromEnv() {
    try {
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

      this.validateConfig(initialConfig);
      
      await pool.query(
        'INSERT INTO system_config (id, config_snapshot, version) VALUES (1, $1, 1)',
        [JSON.stringify(initialConfig)]
      );
      
      this.cache = initialConfig;
      this._version = 1;
      
      console.log('✅ [CONFIG] Auto-seed successful.');
      return this.cache;
    } catch (err) {
      console.error('❌ [CONFIG] Auto-seed failed:', err.message);
      throw this._createError(CONFIG_ERRORS.EMPTY_DB, 'System config table is empty and auto-seed failed: ' + err.message);
    }
  }

  _createError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }
}

module.exports = new ConfigService();
module.exports.CONFIG_ERRORS = CONFIG_ERRORS;
