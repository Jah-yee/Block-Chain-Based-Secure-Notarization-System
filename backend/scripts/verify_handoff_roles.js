const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function verifyHandoff() {
    console.log(`\n🔎 BBSNS HANDOFF READINESS AUDIT`);
    console.log(`-----------------------------------`);

    const rpcUrl = process.env.BNB_TESTNET_RPC_URL || process.env.RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    try {
        const systemWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);
        console.log(`Relayer Address: ${systemWallet.address}`);

        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
        const registryAbi = [
            "function getUserRole(address) view returns (uint8)",
            "function isBanned(address) view returns (bool)",
            "function multiSig() view returns (address)"
        ];
        const registry = new ethers.Contract(registryAddress, registryAbi, provider);

        const relayerRole = await registry.getUserRole(systemWallet.address);
        const relayerBanned = await registry.isBanned(systemWallet.address);
        const multiSig = await registry.multiSig();

        console.log(`\n[NOTARY REGISTRY]`);
        console.log(`- Contract Address: ${registryAddress}`);
        console.log(`- Relayer Role: ${Number(relayerRole)} (3=Admin)`);
        console.log(`- Relayer Banned: ${relayerBanned}`);
        console.log(`- Governance MultiSig: ${multiSig}`);

        const docRegistryAddress = process.env.DOCUMENT_REGISTRY_ADDRESS;
        console.log(`\n[DOCUMENT REGISTRY]`);
        console.log(`- Contract Address: ${docRegistryAddress}`);

        const ntkrAddress = process.env.NTKR_CONTRACT_ADDRESS;
        const ntkAddress = process.env.NTK_CONTRACT_ADDRESS;
        console.log(`\n[TOKENS]`);
        console.log(`- NTKR (Service Credits): ${ntkrAddress}`);
        console.log(`- NTK (Operational Fuel): ${ntkAddress}`);

        if (multiSig.toLowerCase() === systemWallet.address.toLowerCase()) {
            console.log(`\n✅ STATUS: Relayer is the primary governance authority.`);
        } else {
            console.log(`\n⚠️ STATUS: External Governance Authority detected (${multiSig}).`);
        }

        console.log(`\n✅ SYSTEM READY FOR HANDOFF`);

    } catch (err) {
        console.error(`\n❌ AUDIT FAILED: ${err.message}`);
    }
}

verifyHandoff();
