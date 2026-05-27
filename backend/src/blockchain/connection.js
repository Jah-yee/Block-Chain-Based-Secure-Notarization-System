const { ethers } = require("ethers");
const ConfigService = require("../services/config.service");
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

    // 🛡️ Resolve Authoritative Config from SSoT
    const config = await ConfigService.getConfig();
    const registryAddress = config.contracts.documentRegistry;

    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
        throw new Error("FATAL: DOCUMENT_REGISTRY_ADDRESS not configured in SSoT");
    }

    // 2. Resolve Multi-Tier Provider (Phase 2.3)
    const ProviderService = require("./provider-service");
    const provider = await ProviderService.getProvider();

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

const clearConnectionCache = () => {
    cachedProvider = null;
    cachedSigner = null;
    cachedContract = null;
    console.log("🔐 Connection Cache: Ethers provider, signer, and contract cache cleared.");
};

module.exports = { connectBNB, clearConnectionCache };

if (require.main === module) {
  connectBNB().catch(console.error);
}
