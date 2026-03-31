const { ethers } = require("ethers");
const { connectBNB } = require("./connection");

const attachNotaryRegistry = async () => {
    const { signer, provider } = await connectBNB();

    const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
    console.log(`[BLOCKCHAIN] Connecting to NotaryRegistry at: ${registryAddress}`);
    if (!registryAddress) {
        throw new Error("NOTARY_REGISTRY_ADDRESS not configured in .env");
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
        // 0. Ensure Relayer is set (if not already)
        // Public variables in Solidity create a getter function of the same name
        const currentRelayer = await contract.relayer();
        const signerAddress = await signer.getAddress();

        if (currentRelayer === ethers.ZeroAddress) {
            console.log(`   - Initializing Relayer to: ${signerAddress}...`);
            const txR = await contract.updateRelayer(signerAddress);
            await txR.wait();
        }

        // 1. Assign Owner Role (Step 1 in Enum)
        const rawRole = await contract.getUserRole(walletAddress);
        const currentRole = Number(rawRole);

        if (currentRole === 0) { // Role.NONE
            console.log(`   - Step 1: Assigning OWNER role...`);
            const tx1 = await contract.assignOwner(walletAddress);
            await tx1.wait();
            console.log(`   ✅ OWNER role assigned: ${tx1.hash}`);
        }

        // 2. Promote to Notary (Step 2 in Enum)
        // Refresh role after step 1
        const refreshedRole = Number(await contract.getUserRole(walletAddress));

        if (refreshedRole <= 1) { // Role.NONE or Role.OWNER
            console.log(`   - Step 2: Promoting to NOTARY role...`);
            const tx2 = await contract.promoteToNotary(walletAddress);
            const receipt = await tx2.wait();
            console.log(`   ✅ NOTARY role promoted: ${tx2.hash}`);
            return { txHash: receipt.hash, success: true };
        }

        console.log(`   ℹ️ User already has role: ${currentRole}`);
        return { success: true, alreadyExists: true };
    } catch (err) {
        console.error(`[BLOCKCHAIN_ERROR] Failed to register notary ${walletAddress}:`, err.message);
        throw err;
    }
};

module.exports = { registerNotaryOnChain };
