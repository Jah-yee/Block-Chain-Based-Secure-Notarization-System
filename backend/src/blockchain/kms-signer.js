const {
    AbstractSigner,
    ethers,
    Signature,
    keccak256,
    resolveAddress,
    resolveProperties,
    Transaction
} = require('ethers');
const { KMSClient, SignCommand, GetPublicKeyCommand } = require("@aws-sdk/client-kms");
const asn1 = require('asn1.js');

// Define ASN.1 schema for ECDSA signature
const EcdsaSig = asn1.define('EcdsaSig', function () {
    this.seq().obj(
        this.key('r').int(),
        this.key('s').int()
    );
});

// Curve order N for secp256k1
const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const SECP256K1_HALF_N = SECP256K1_N / 2n;

class KMSSigner extends AbstractSigner {
    constructor(keyId, provider, clientConfig = {}) {
        super(provider);
        this.keyId = keyId;
        this.kms = new KMSClient(clientConfig);
        this.address = null;
    }

    async getAddress() {
        if (this.address) return this.address;

        const command = new GetPublicKeyCommand({ KeyId: this.keyId });
        const response = await this.kms.send(command);

        // AWS KMS returns SPKI format. For secp256k1, header is 23 bytes.
        const der = Buffer.from(response.PublicKey);
        const uncompressedPubkey = der.subarray(23);

        if (uncompressedPubkey[0] !== 0x04) {
            throw new Error(`Unsupported public key format: ${uncompressedPubkey[0]}`);
        }

        const pubkeyBody = uncompressedPubkey.subarray(1); // X || Y
        const hash = keccak256(pubkeyBody);
        this.address = ethers.getAddress('0x' + hash.substring(hash.length - 40));

        return this.address;
    }

    async signTransaction(tx) {
        const address = await this.getAddress();

        const resolvedTx = await resolveProperties(tx);
        if (resolvedTx.from != null) {
            if (ethers.getAddress(resolvedTx.from) !== address) {
                throw new Error("Transaction 'from' mismatch");
            }
            delete resolvedTx.from;
        }

        // Populate transaction
        const populatedTx = await this.populateTransaction(resolvedTx);

        // Get the digest to sign
        const unsignedTx = Transaction.from(populatedTx);
        const digest = unsignedTx.unsignedHash;

        // Sign the digest
        const signature = await this._signDigest(digest);

        // Finalize with signature
        unsignedTx.signature = signature;

        return unsignedTx.serialized;
    }

    async signMessage(message) {
        const digest = ethers.hashMessage(message);
        const signature = await this._signDigest(digest);
        return signature.serialized;
    }

    async signTypedData(domain, types, value) {
        const digest = ethers.TypedDataEncoder.hash(domain, types, value);
        const signature = await this._signDigest(digest);
        return signature.serialized;
    }

    async _signDigest(digest) {
        const address = await this.getAddress();

        const command = new SignCommand({
            KeyId: this.keyId,
            Message: Buffer.from(ethers.getBytes(digest)),
            MessageType: 'DIGEST',
            SigningAlgorithm: 'ECDSA_SHA_256'
        });

        const response = await this.kms.send(command);
        const derSig = Buffer.from(response.Signature);

        // 1. Parse DER to r, s
        const decoded = EcdsaSig.decode(derSig, 'der');
        let r = decoded.r.toString(16);
        let s = decoded.s.toString(16);

        // Pad to 32 bytes
        r = r.padStart(64, '0');
        s = s.padStart(64, '0');

        let bigR = BigInt('0x' + r);
        let bigS = BigInt('0x' + s);

        // 2. Low-S normalization
        if (bigS > SECP256K1_HALF_N) {
            bigS = SECP256K1_N - bigS;
        }

        // 3. Recover v (Trial-and-error with both possible recovery IDs)
        // For secp256k1, v is either 27 or 28
        const sig27 = Signature.from({ r: '0x' + bigR.toString(16).padStart(64, '0'), s: '0x' + bigS.toString(16).padStart(64, '0'), v: 27 });
        if (ethers.recoverAddress(digest, sig27).toLowerCase() === address.toLowerCase()) {
            return sig27;
        }

        const sig28 = Signature.from({ r: '0x' + bigR.toString(16).padStart(64, '0'), s: '0x' + bigS.toString(16).padStart(64, '0'), v: 28 });
        if (ethers.recoverAddress(digest, sig28).toLowerCase() === address.toLowerCase()) {
            return sig28;
        }

        throw new Error("Failed to recover correct recovery ID (v)");
    }

    connect(provider) {
        return new KMSSigner(this.keyId, provider);
    }
}

module.exports = { KMSSigner };
