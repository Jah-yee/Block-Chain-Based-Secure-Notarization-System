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
   * Verifies SHA256 Checksum (Integrity check against corruption)
   */
  static async verifyChecksum(config, receivedChecksum) {
    try {
      const salt = 'bbsns_prod_secure_2026'; // Match Backend salt
      
      // Deterministic stringification (Match Backend logic)
      const keys = Object.keys(config).sort();
      const data = JSON.stringify(config, keys);
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode(salt);
      const messageData = encoder.encode(data);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify', 'sign']
      );

      const signature = await window.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        messageData
      );

      const hashArray = Array.from(new Uint8Array(signature));
      const calculatedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return calculatedChecksum === receivedChecksum;
    } catch (e) {
      console.error('[VALIDATOR] Checksum verification failed with error:', e);
      return false;
    }
  }
}
