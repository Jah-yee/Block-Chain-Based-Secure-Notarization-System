const { KMSSigner } = require('../src/blockchain/kms-signer');
const { ethers, Signature } = require('ethers');
const assert = require('assert');
const asn1 = require('asn1.js');

// Mock Data
const TEST_PRIVATE_KEY = '0x0123456789012345678901234567890123456789012345678901234567890123';
const wallet = new ethers.Wallet(TEST_PRIVATE_KEY);
const EXPECTED_ADDRESS = wallet.address;
const PUBKEY = wallet.signingKey.publicKey; // 0x04 || X || Y

/**
 * Manual Mock for KMSClient
 */
class MockKMSClient {
    constructor(config) {
        this.config = config;
    }

    async send(command) {
        const cmdName = command.constructor.name;
        if (cmdName === 'GetPublicKeyCommand') {
            const header = Buffer.alloc(23, 0); // SPKI header
            const PublicKey = Buffer.concat([header, Buffer.from(PUBKEY.substring(2), 'hex')]);
            return { PublicKey };
        }

        if (cmdName === 'SignCommand') {
            const digest = command.input.Message;
            const sig = wallet.signingKey.sign(digest);

            // Encode to DER
            const EcdsaSig = asn1.define('EcdsaSig', function () {
                this.seq().obj(
                    this.key('r').int(),
                    this.key('s').int()
                );
            });

            const SignatureBuffer = EcdsaSig.encode({
                r: Buffer.from(sig.r.substring(2), 'hex'),
                s: Buffer.from(sig.s.substring(2), 'hex')
            }, 'der');

            return { Signature: SignatureBuffer };
        }
        throw new Error('Unknown command');
    }
}

// Inject Mock into global room (or just override in current scope)
// In our implementation, KMSSigner uses require("@aws-sdk/client-kms").
// We'll use a wrapper class or monkey-patch.
// Actually, let's just make KMSSigner use our mock for the test.

/**
 * Test Runner
 */
async function runTests() {
    console.log('--- KMSSigner Logic Verification (Manual) ---');

    const signer = new KMSSigner('alias/test', null);

    // Monkey-patch the kms client
    signer.kms = new MockKMSClient();

    // Test 1: getAddress()
    console.log('1. Testing address derivation...');
    const address = await signer.getAddress();
    console.log('   Expected:', EXPECTED_ADDRESS);
    console.log('   Actual:  ', address);
    assert.strictEqual(address, EXPECTED_ADDRESS, 'Address derivation mismatch');
    console.log('   ✅ Pass');

    // Test 2: _signDigest()
    console.log('\n2. Testing _signDigest (DER parse + Low-S + v-recovery)...');
    const digest = ethers.id("test message");
    const signature = await signer._signDigest(digest);

    console.log('   r:', signature.r);
    console.log('   s:', signature.s);
    console.log('   v:', signature.v);

    const recovered = ethers.recoverAddress(digest, signature);
    console.log('   Recovered:', recovered);
    assert.strictEqual(recovered, EXPECTED_ADDRESS, 'Signature recovery mismatch');
    console.log('   ✅ Pass');

    // Test 3: Large S value handling (Manual injection)
    console.log('\n3. Testing Low-S normalization trigger...');
    const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const HIGH_S_SIG = {
        r: Buffer.from(signature.r.substring(2), 'hex'),
        s: Buffer.from((SECP256K1_N - BigInt(signature.s)).toString(16), 'hex')
    };

    const EcdsaSig = asn1.define('EcdsaSig', function () {
        this.seq().obj(this.key('r').int(), this.key('s').int());
    });

    const derWithHighS = EcdsaSig.encode(HIGH_S_SIG, 'der');

    // Temporarily override KMS to return high-S sig
    const originalSend = signer.kms.send;
    signer.kms.send = async () => ({ Signature: derWithHighS });

    const normalizedSig = await signer._signDigest(digest);
    const sigBigS = BigInt(normalizedSig.s);
    assert(sigBigS < (SECP256K1_N / 2n), 'S was not normalized to low value');
    console.log('   Normalized S:', normalizedSig.s);
    console.log('   ✅ Pass');

    console.log('\n--- ALL TESTS PASSED ---');
}

runTests().catch(err => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
});
