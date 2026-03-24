const { KMSSigner } = require('../src/blockchain/kms-signer');
const { ethers, Signature } = require('ethers');

// Mock AWS SDK
jest.mock('@aws-sdk/client-kms', () => {
    return {
        KMSClient: jest.fn().mockImplementation(() => ({
            send: jest.fn().mockImplementation((command) => {
                console.log('DEBUG: Mock received command:', JSON.stringify(command));
                if (command.type === 'GetPublicKeyCommand') {
                    // SPKI for secp256k1 derived from private key '0xabc...' 
                    // (example pubkey for testing)
                    // For simplicity, we can use a known pubkey and its address.
                    // Let's use a real Wallet to get a known pair.
                    const wallet = new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
                    const pubkey = wallet.signingKey.publicKey; // 0x04 || X || Y

                    // Reconstruct a "valid-ish" SPKI buffer (23 byte header + 65 byte pubkey)
                    const header = Buffer.alloc(23, 0);
                    const fullDer = Buffer.concat([header, Buffer.from(pubkey.substring(2), 'hex')]);

                    return Promise.resolve({ PublicKey: fullDer });
                }

                if (command.type === 'SignCommand') {
                    // We need to return a DER encoded signature SEQUENCE { INTEGER r, INTEGER s }
                    // We'll mock it by actually signing with ecdsa or just hardcoding a valid DER.
                    // r: 1, s: 1 in DER is 30 06 02 01 01 02 01 01
                    // But it needs to be valid for the recovery check.

                    // Let's sign the digest with a real wallet to get a real signature, then DER encode it.
                    const wallet = new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
                    const sig = wallet.signingKey.sign(command.input.Message);

                    // Encode to DER
                    const asn1 = require('asn1.js');
                    const EcdsaSig = asn1.define('EcdsaSig', function () {
                        this.seq().obj(
                            this.key('r').int(),
                            this.key('s').int()
                        );
                    });

                    const der = EcdsaSig.encode({
                        r: BigInt(sig.r),
                        s: BigInt(sig.s)
                    }, 'der');

                    return Promise.resolve({ Signature: der });
                }
                return Promise.reject(new Error(`Unknown command: ${command.type}`));
            })
        })),
        SignCommand: jest.fn().mockImplementation((input) => ({ type: 'SignCommand', input })),
        GetPublicKeyCommand: jest.fn().mockImplementation((input) => ({ type: 'GetPublicKeyCommand', input }))
    };
});

describe('KMSSigner', () => {
    const keyId = 'alias/test-key';
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    const expectedAddress = new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123').address;

    test('getAddress() should derive correct Ethereum address', async () => {
        const signer = new KMSSigner(keyId, provider);
        const address = await signer.getAddress();
        expect(address).toBe(expectedAddress);
    });

    test('signMessage() should return a recoverable signature', async () => {
        const signer = new KMSSigner(keyId, provider);
        const message = "Hello KMS";
        const sigString = await signer.signMessage(message);

        const recovered = ethers.verifyMessage(message, sigString);
        expect(recovered).toBe(expectedAddress);
    });

    test('_signDigest() should handle Low-S normalization and v-recovery', async () => {
        const signer = new KMSSigner(keyId, provider);
        const digest = ethers.id("test digest");

        const signature = await signer._signDigest(digest);
        expect(signature.r).toBeDefined();
        expect(signature.s).toBeDefined();
        expect([27, 28]).toContain(signature.v);

        const recovered = ethers.recoverAddress(digest, signature);
        expect(recovered).toBe(expectedAddress);
    });
});
