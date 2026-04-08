/**
 * 🛡️ CONFIG VALIDATOR (RESILIENCE LAYER)
 * Responsibility: Verify integrity and sanity of configuration payloads.
 */

const VALID_CHAIN_ID = 97;

export class ConfigValidator {
  /**
   * Performs a strict integrity and sanity check.
   */
  static async validate(config) {
    if (!config || typeof config !== 'object') return false;

    // 1. Schema Integrity
    const required = ['rpcUrl', 'chainId', 'contracts', 'apiBaseUrl'];
    for (const field of required) {
      if (!config[field]) {
        console.error(`[VALIDATOR] Missing required field: ${field}`);
        return false;
      }
    }

    // 2. Chain Sanity
    if (Number(config.chainId) !== VALID_CHAIN_ID) {
      console.error(`[VALIDATOR] Invalid ChainID: ${config.chainId}`);
      return false;
    }

    // 3. Contract Sanity
    const contracts = config.contracts;
    const isValidAddr = (addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
    
    if (!isValidAddr(contracts.notaryRegistry) || !isValidAddr(contracts.documentRegistry)) {
      console.error('[VALIDATOR] Malformed contract addresses detected.');
      return false;
    }

    // 4. URL Sanity
    if (!config.apiBaseUrl.startsWith('http')) {
      console.error('[VALIDATOR] Invalid API Base URL.');
      return false;
    }

    return true;
  }

  /**
   * 🛡️ normalizeConfig() - ENSURES DETERMINISTIC MIRRORING
   * Responsibility: Ensure deterministic types and fields BEFORE hashing.
   * MATCHES BACKEND: config.service.js -> normalizeConfig()
   */
  static normalizeConfig(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    
    const normalized = {};
    for (const [key, val] of Object.entries(obj)) {
      let value = val;

      // 🛡️ [BACKEND_PARITY] Drop undefined, null, and excluded security fields
      if (value === undefined || value === null) continue;
      if (key === 'checksum' || key === 'signature' || key === 'debug_string') continue;

      // 🛡️ [BACKEND_PARITY] Standardize Dates to ISO String
      if (value instanceof Date || (typeof value === 'string' && key === 'updatedAt')) {
        value = new Date(value).toISOString();
      }

      // 🛡️ [BACKEND_PARITY] Recursive Normalize for Objects
      if (typeof value === 'object' && !(value instanceof Date)) {
        value = this.normalizeConfig(value);
      }

      // 🛡️ [BACKEND_PARITY] Explicit Type Casting for known numeric fields
      if (['version', 'config_version', 'chainId'].includes(key)) {
        value = Number(value);
      }

      normalized[key] = value;
    }

    return normalized;
  }

  /**
   * 🛡️ deepSort() - Deterministic recursive sorting
   * MATCHES BACKEND: config.service.js -> deepSort()
   */
  static deepSort(obj) {
    if (Array.isArray(obj)) {
      // 🛡️ [BACKEND_PARITY] Backend maps but DOES NOT sort arrays
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

  /**
   * Verifies SHA256 Checksum (Matches Backend HMAC Logic)
   */
  static async verifyChecksum(config, receivedChecksum) {
    try {
      const salt = 'bbsns_prod_secure_2026'; // Match process.env.CONFIG_CHECKSUM_SALT || '...'
      const normalized = this.normalizeConfig(config);
      const sorted = this.deepSort(normalized);
      const data = JSON.stringify(sorted); // Match backend JSON.stringify logic
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode(salt);
      const messageData = encoder.encode(data);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      );

      const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, messageData);
      const hashArray = Array.from(new Uint8Array(signatureBuffer));
      const calculatedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 🔍 [HARDENED_FORENSIC_AUDIT]
      console.log("--- 🛡️ CONFIG FORENSIC AUDIT (START) ---");
      console.log("FRONTEND_STRING_START");
      console.log(data);
      console.log("FRONTEND_STRING_END");

      if (config.debug_string) {
        console.log("BACKEND_STRING_START");
        console.log(config.debug_string);
        console.log("BACKEND_STRING_END");

        const findDiff = (a, b) => {
          const len = Math.max(a.length, b.length);
          for (let i = 0; i < len; i++) {
            if (a[i] !== b[i]) {
              console.warn(`[TRUTH_GAP] First discrepancy at index: ${i}`);
              console.warn(`[FRONTEND]: '${a[i]}' (code: ${a ? a.charCodeAt(i) : 'N/A'})`);
              console.warn(`[BACKEND] : '${b[i]}' (code: ${b ? b.charCodeAt(i) : 'N/A'})`);
              console.warn(`[CONTEXT] : ...${a.substring(Math.max(0, i-5), i+10)}...`);
              return;
            }
          }
        };
        findDiff(data, config.debug_string);
      }

      console.log("FRONTEND_HASH:", calculatedChecksum);
      console.log("BACKEND_HASH:", receivedChecksum);
      console.log("--- 🛡️ CONFIG FORENSIC AUDIT (END) ---");

      return calculatedChecksum === receivedChecksum;
    } catch (e) {
      console.error('[VALIDATOR] Checksum Error:', e);
      return false;
    }
  }
}
