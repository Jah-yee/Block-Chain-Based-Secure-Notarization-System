const { ethers } = require("ethers");
require("dotenv").config({ override: true });

let cachedProvider = null;
let cachedSigner = null;
let cachedContract = null;

/**
 * 🛡️ connectBNB - RESILIENT BLOCKCHAIN CONNECTION
 * Implements:
 *  - Exponential Backoff for Provider Initialization
 *  - Fallback RPC Support
 *  - Singleton Connection Caching
 */
const connectBNB = async () => {
    // 1. Singleton Check
    if (cachedProvider && cachedContract) {
        return { provider: cachedProvider, signer: cachedSigner, contract: cachedContract };
    }

    const registryAddress = process.env.DOCUMENT_REGISTRY_ADDRESS;
    if (!registryAddress) {
        throw new Error("FATAL: DOCUMENT_REGISTRY_ADDRESS not configured");
    }

    // 2. Resolve RPC Endpoints
    const rpcUrls = (process.env.BNB_RPC_URLS || process.env.BNB_TESTNET_RPC_URL || process.env.RPC_URL || "")
        .split(',')
        .filter(url => url.trim().length > 0);

    if (rpcUrls.length === 0) {
        throw new Error("FATAL: No blockchain RPC URLs configured");
    }

    let provider = null;
    let lastError = null;

    // 3. Resilient Connection Loop (Backoff + Fallback)
    for (const url of rpcUrls) {
        let attempt = 0;
        const maxAttempts = 3;

        while (attempt < maxAttempts) {
            try {
                console.log(`📡 [BLOCKCHAIN] Connecting to ${url} (Attempt ${attempt + 1})...`);
                const tempProvider = new ethers.JsonRpcProvider(url.trim(), undefined, {
                    staticNetwork: true // Performance: skip detectNetwork calls
                });
                
                // Active verification
                await tempProvider.getNetwork();
                console.log(`✅ [BLOCKCHAIN] Connected to ${url}`);
                
                provider = tempProvider;
                break; // Succession!
            } catch (err) {
                attempt++;
                lastError = err;
                console.error(`⚠️ [BLOCKCHAIN] Connection to ${url} failed: ${err.message}`);
                if (attempt < maxAttempts) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        if (provider) break; // Found a working RPC
    }

    if (!provider) {
        throw new Error(`FATAL: All RPC connection attempts failed. Last error: ${lastError?.message}`);
    }

    // 4. Signer Resolver (KMS or Private Key)
    let signer;
    const kmsKeyId = process.env.AWS_KMS_KEY_ID;
    const hasAWSCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

    if (kmsKeyId && hasAWSCredentials && process.env.AWS_ACCESS_KEY_ID !== 'your_access_key') {
        console.log(`🔐 RELAYER: Using AWS KMS signing`);
        const { KMSSigner } = require("./kms-signer");
        signer = new KMSSigner(kmsKeyId, provider, { region: process.env.AWS_REGION || "us-east-1" });
    } else if (process.env.BNB_SYSTEM_PRIVATE_KEY && process.env.BNB_SYSTEM_PRIVATE_KEY.length > 32) {
        console.warn("ℹ️ RELAYER: Fallback to plaintext Private Key");
        signer = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
    } else {
        throw new Error("No valid blockchain signer found in .env");
    }

    const contractABI = [
        "function recordAction(bytes32 docHash, address ownerAddress, uint8 status, bytes32 summaryHash, bytes32 rejectionReasonHash, uint256 timestamp, uint256 nonce, bytes signature) external",
        "function nonces(address) view returns (uint256)",
        "function getDocument(bytes32 docHash) external view returns (address notary, uint256 timestamp, uint8 status, bool exists)",
        "function paused() external view returns (bool)"
    ];

    const contract = new ethers.Contract(registryAddress, contractABI, signer);

    // Cache the connections
    cachedProvider = provider;
    cachedSigner = signer;
    cachedContract = contract;

    return { provider, signer, contract };
};

module.exports = { connectBNB };

if (require.main === module) {
  connectBNB().catch(console.error);
}
