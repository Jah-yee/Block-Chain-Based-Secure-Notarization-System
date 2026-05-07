const { ethers } = require("ethers");
const { connectBNB } = require("./connection");
const ConfigService = require("../services/config.service");

const attachNotaryRegistry = async () => {
    const { signer, provider } = await connectBNB();
    const config = await ConfigService.getConfig();

    const registryAddress = config.contracts.notaryRegistry;
    console.log(`[BLOCKCHAIN] Connecting to NotaryRegistry at: ${registryAddress}`);
    if (!registryAddress || registryAddress === ethers.ZeroAddress) {
        throw new Error("NOTARY_REGISTRY_ADDRESS not configured in SSoT");
    }

    const abi = [
        "function assignOwner(address _user)",
        "function promoteToNotary(address _user)",
        "function promoteToAdmin(address _user)",
        "function getUserRole(address _user) view returns (uint8)",
        "function isBanned(address _user) view returns (bool)",
        "function relayer() view returns (address)",
        "function updateRelayer(address _newRelayer)"
    ];

    return { contract: new ethers.Contract(registryAddress, abi, signer), signer };
};

const registerNotaryOnChain = async (walletAddress) => {
    console.log(`[BLOCKCHAIN] Registering notary ${walletAddress} on-chain...`);

    const { contract, signer } = await attachNotaryRegistry();

    try {
        // 1. Perform direct promotion to NOTARY
        const rawRole = await contract.getUserRole(walletAddress);
        const currentRole = Number(rawRole);

        if (currentRole < 2) { // Role.NONE (0) or Role.OWNER (1)
            console.log(`   - Initiating direct on-chain promotion for: ${walletAddress}`);
            const tx = await contract.promoteToNotary(walletAddress);
            const receipt = await tx.wait();
            console.log(`   ✅ NOTARY role promoted: ${tx.hash}`);
            return { txHash: receipt.hash, success: true };
        }


        console.log(`   ℹ️ User already has role: ${currentRole}`);
        return { success: true, alreadyExists: true };
    } catch (err) {
        console.error(`[BLOCKCHAIN_ERROR] Failed to register notary ${walletAddress}:`, err.message);
        throw err;
    }
};

module.exports = { registerNotaryOnChain, attachNotaryRegistry };
