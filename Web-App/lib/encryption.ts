/**
 * CLIENT-SIDE ENCRYPTION UTILITIES
 * --------------------------------
 * Algorithm: AES-256-GCM
 * Key: 256-bit Random (Ephemeral, Browser-Memory Only)
 * IV: 96-bit Random
 * Format: [ Version(1) | IV(12) | Ciphertext(...) ]
 * 
 * Key Transport: RSA-OAEP-SHA256 (Wrapper)
 */

const ENC_ALGO = 'AES-GCM';
const WRAP_ALGO = 'RSA-OAEP';
const WRAP_HASH = 'SHA-256';
const ENC_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits
const VERSION_BYTE = new Uint8Array([1]); // Version 1

export interface EncryptedResult {
    encryptedBlob: Blob;
    key: CryptoKey; // Ephemeral Key (Hold in memory!)
    iv: Uint8Array;
}

/**
 * Generates a purely ephemeral AES-256 key in browser memory.
 * NEVER store this key.
 */
export async function generateEphemeralKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
        {
            name: ENC_ALGO,
            length: ENC_LENGTH,
        },
        true, // extractable (need to export it eventually for the notary)
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a file using AES-GCM.
 * Returns the formatted blob and the raw key (for memory holding).
 */
export async function encryptFile(file: File): Promise<EncryptedResult> {
    // 1. Generate Key
    const key = await generateEphemeralKey();

    // 2. Generate IV
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // 3. Read File as ArrayBuffer
    const fileBuffer = await file.arrayBuffer();

    // 4. Encrypt
    // Result includes Ciphertext + Auth Tag (appended automatically by WebCrypto AES-GCM)
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: ENC_ALGO,
            iv: iv,
        },
        key,
        fileBuffer
    );

    // 5. Construct Protocol Blob: [ Version | IV | Ciphertext ]
    // Calculate total length
    const totalLength = VERSION_BYTE.length + iv.length + ciphertextBuffer.byteLength;
    const resultBuffer = new Uint8Array(totalLength);

    // Set Version
    resultBuffer.set(VERSION_BYTE, 0);
    // Set IV
    resultBuffer.set(iv, VERSION_BYTE.length);
    // Set Ciphertext
    resultBuffer.set(new Uint8Array(ciphertextBuffer), VERSION_BYTE.length + iv.length);

    // 6. Zero out the plaintext buffer (Best effort in JS)
    // We can't explicitly zero the ArrayBuffer returned by file.arrayBuffer() easily if it's detached, 
    // but we can ensure we don't hold references.
    // We can try to zero the typed array view if mutable.
    try {
        new Uint8Array(fileBuffer).fill(0);
    } catch (e) {
        // Ignore if buffer is immutable or detached, but log for awareness
        console.debug('Could not explicitly zero plaintext buffer (engine limitation)');
    }

    return {
        encryptedBlob: new Blob([resultBuffer], { type: 'application/octet-stream' }),
        key,
        iv
    };
}

/**
 * Decrypts a blob using the provided key.
 * Expected format: [ Version(1) | IV(12) | Ciphertext(...) ]
 */
export async function decryptFile(
    encryptedBlob: Blob,
    key: CryptoKey
): Promise<ArrayBuffer> {
    const buffer = await encryptedBlob.arrayBuffer();
    const arr = new Uint8Array(buffer);

    // 1. Check Version
    if (arr[0] !== 1) {
        throw new Error('Unknown Encryption Version');
    }

    // 2. Extract IV
    const iv = arr.slice(1, 1 + IV_LENGTH);

    // 3. Extract Ciphertext
    const ciphertext = arr.slice(1 + IV_LENGTH);

    // 4. Decrypt
    return window.crypto.subtle.decrypt(
        {
            name: ENC_ALGO,
            iv: iv,
        },
        key,
        ciphertext
    );
}

/**
 * Imports a PEM-encoded RSA Public Key for wrapping.
 */
export async function importNotaryPublicKey(pem: string): Promise<CryptoKey> {
    // Strip headers/footers and newlines
    const binaryString = window.atob(
        pem
            .replace(/-----BEGIN PUBLIC KEY-----/, '')
            .replace(/-----END PUBLIC KEY-----/, '')
            .replace(/\s/g, '')
    );
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return window.crypto.subtle.importKey(
        'spki',
        bytes.buffer,
        {
            name: WRAP_ALGO,
            hash: WRAP_HASH,
        },
        true,
        ['wrapKey']
    );
}

/**
 * Wraps the AES key for the Notary using RSA-OAEP.
 * Returns the raw bytes of the wrapped key.
 */
export async function wrapKeyForNotary(
    aesKey: CryptoKey,
    notaryPublicKey: CryptoKey
): Promise<ArrayBuffer> {
    return window.crypto.subtle.wrapKey(
        'raw', // Export AES key as raw bytes
        aesKey,
        notaryPublicKey,
        {
            name: WRAP_ALGO,
        }
    );
}

/**
 * Imports a PEM-encoded RSA Private Key for unwrapping (Notary Only).
 */
export async function importNotaryPrivateKey(pem: string): Promise<CryptoKey> {
    const binaryString = window.atob(
        pem
            .replace(/-----BEGIN PRIVATE KEY-----/, '')
            .replace(/-----END PRIVATE KEY-----/, '')
            .replace(/\s/g, '')
    );
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return window.crypto.subtle.importKey(
        'pkcs8',
        bytes.buffer,
        {
            name: WRAP_ALGO,
            hash: WRAP_HASH,
        },
        true,
        ['unwrapKey']
    );
}

/**
 * Unwraps the AES key using the Notary's Private Key.
 */
export async function unwrapKeyForNotary(
    wrappedKey: ArrayBuffer,
    notaryPrivateKey: CryptoKey
): Promise<CryptoKey> {
    return window.crypto.subtle.unwrapKey(
        'raw',
        wrappedKey,
        notaryPrivateKey,
        {
            name: WRAP_ALGO,
        },
        {
            name: ENC_ALGO,
            length: ENC_LENGTH,
        },
        true,
        ['decrypt']
    );
}
