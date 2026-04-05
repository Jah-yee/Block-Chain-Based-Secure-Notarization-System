/**
 * 🛡️ CONFIG VALIDATOR (RESILIENCE LAYER)
 * Responsibility: Verify integrity and sanity of configuration payloads.
 */

const VALID_CHAIN_ID = 97;

export class ConfigValidator {
  /**
   * Performs a strict integrity and sanity check.
   */
  static async validate(config: any): Promise<boolean> {
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
    const expectedChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "97");
    if (!config.chainId || Number(config.chainId) !== expectedChainId) {
      console.error(`[VALIDATOR] Invalid ChainID: ${config.chainId} (Expected ${expectedChainId})`);
      return false;
    }

    // 3. Contract Sanity
    const contracts = config.contracts;
    const isValidAddr = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    
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
   * 🛡️ normalizeConfig() - Identical structure for both Backend and Frontend
   * Responsibility: Ensure deterministic types and fields before hashing.
   */
  static normalizeConfig(config: any): any {
    if (!config || typeof config !== 'object' || config === null) return config;

    const normalized: any = {};
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
   * 🛡️ deepSort() - Deterministic recursive sorting (Matches Backend)
   */
  static deepSort(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item: any) => this.deepSort(item));
    } else if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((acc: any, key: string) => {
          acc[key] = this.deepSort(obj[key]);
          return acc;
        }, {});
    }
    return obj;
  }

  /**
   * Verifies SHA256 Checksum (Integrity check against corruption)
   */
  static async verifyChecksum(config: any, receivedChecksum: string): Promise<boolean> {
    try {
      const salt = 'bbsns_prod_secure_2026';
      
      // 🛡️ 1. Normalize and Sort (Deterministic Mirroring)
      const normalized = this.normalizeConfig(config);
      const sorted = this.deepSort(normalized);

      // 🛡️ 2. Deterministic Stringification
      const data = JSON.stringify(sorted);
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode(salt);
      const messageData = encoder.encode(data);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify', 'sign']
      );

      const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        messageData
      );

      const hashArray = Array.from(new Uint8Array(signature));
      const calculatedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 🛡️ 3. Double-Truth Logging
      console.log("--- 🛡️ CONFIG CHECKSUM VERIFICATION ---");
      console.log("FRONTEND_STRING:", data);
      console.log("FRONTEND_HASH:", calculatedChecksum);
      console.log("RECEIVED_HASH:", receivedChecksum);
      console.log("---------------------------------------");

      return calculatedChecksum === receivedChecksum;
    } catch (e) {
      console.error('[VALIDATOR] Checksum verification failed with error:', e);
      return false;
    }
  }
}
