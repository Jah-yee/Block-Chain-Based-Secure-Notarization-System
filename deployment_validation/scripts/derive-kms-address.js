/**
 * derive-kms-address.js
 * 
 * Derives an Ethereum address from an AWS KMS secp256k1 public key (SPKI PEM).
 * 
 * Usage: node scripts/derive-kms-address.js [path-to-pem]
 * 
 * SPKI PEM structure for secp256k1:
 *   SEQUENCE {
 *     SEQUENCE { OID ecPublicKey, OID secp256k1 }
 *     BIT STRING (65 bytes: 04 || x || y)
 *   }
 * 
 * The ASN.1 header for secp256k1 SPKI is always 23 bytes.
 * After stripping: 65-byte uncompressed pubkey (04 || 32-byte X || 32-byte Y).
 * Ethereum address = last 20 bytes of keccak256(X || Y).
 */

const fs = require('fs');
const crypto = require('crypto');
const { ethers } = require('ethers');

// --- Configuration ---
const DEFAULT_PEM_PATH = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\BBSNS\\documentation\\IAM\\Relayer Publickey-18f4f3b7-c83b-4a2e-9daf-b91692d5f95d.pem';
const SPKI_SECP256K1_HEADER_LENGTH = 23; // Fixed ASN.1 header length for secp256k1 SPKI
const UNCOMPRESSED_PUBKEY_LENGTH = 65;   // 04 prefix + 32-byte X + 32-byte Y

// --- Main ---
function deriveAddressFromPem(pemPath) {
    // 1. Read PEM
    const pemContent = fs.readFileSync(pemPath, 'utf-8');
    console.log(`📄 PEM file: ${pemPath}`);

    // 2. Strip PEM headers and decode base64
    const base64 = pemContent
        .replace(/-----BEGIN PUBLIC KEY-----/, '')
        .replace(/-----END PUBLIC KEY-----/, '')
        .replace(/\s+/g, '');

    const derBuffer = Buffer.from(base64, 'base64');
    console.log(`   DER length: ${derBuffer.length} bytes`);

    // 3. Validate SPKI structure
    //    Expected: 23-byte header + 65-byte uncompressed pubkey = 88 bytes total
    if (derBuffer.length !== SPKI_SECP256K1_HEADER_LENGTH + UNCOMPRESSED_PUBKEY_LENGTH) {
        throw new Error(
            `FATAL: Unexpected DER length. Expected ${SPKI_SECP256K1_HEADER_LENGTH + UNCOMPRESSED_PUBKEY_LENGTH}, got ${derBuffer.length}. ` +
            `This may not be a secp256k1 SPKI public key.`
        );
    }

    // 4. Extract uncompressed public key (skip ASN.1 header)
    const uncompressedPubkey = derBuffer.subarray(SPKI_SECP256K1_HEADER_LENGTH);

    // Verify 0x04 prefix (uncompressed point marker)
    if (uncompressedPubkey[0] !== 0x04) {
        throw new Error(
            `FATAL: Expected uncompressed pubkey prefix 0x04, got 0x${uncompressedPubkey[0].toString(16)}. ` +
            `Compressed keys are not supported.`
        );
    }

    console.log(`   Uncompressed pubkey: 0x${uncompressedPubkey.toString('hex')}`);

    // 5. Keccak256 of the public key (without 0x04 prefix)
    const pubkeyBody = uncompressedPubkey.subarray(1); // 64 bytes: X || Y
    const hash = ethers.keccak256(pubkeyBody);

    // 6. Ethereum address = last 20 bytes of the hash
    const address = ethers.getAddress('0x' + hash.slice(-40));

    console.log(`\n✅ Derived Ethereum Address: ${address}`);
    console.log(`   (Checksummed via EIP-55)`);

    return address;
}

// --- Execute ---
const pemPath = process.argv[2] || DEFAULT_PEM_PATH;

try {
    const address = deriveAddressFromPem(pemPath);

    // Output for .env consumption
    console.log(`\n📋 For .env:`);
    console.log(`KMS_EXPECTED_ADDRESS=${address}`);
} catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
}
