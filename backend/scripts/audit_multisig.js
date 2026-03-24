const { ethers } = require("ethers");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function auditMultiSig() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const multiSigAddress = process.env.MULTISIG_CONTRACT_ADDRESS;

    console.log(`\n🔍 AUDITING MULTISIG: ${multiSigAddress}`);

    try {
        const abi = [
            "function threshold() view returns (uint256)",
            "function getSigners() view returns (address[])",
            "function timelockDelay() view returns (uint256)",
            "function signerVersion() view returns (uint256)"
        ];

        const contract = new ethers.Contract(multiSigAddress, abi, provider);

        const [threshold, signers, delay, version] = await Promise.all([
            contract.threshold(),
            contract.getSigners(),
            contract.timelockDelay(),
            contract.signerVersion()
        ]);

        console.log(`- Threshold: ${threshold}`);
        console.log(`- Signers: ${signers.join(', ')}`);
        console.log(`- Timelock Delay: ${delay} seconds`);
        console.log(`- Signer Version: ${version}`);

        // Check NotaryRegistry authority
        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
        const registryAbi = ["function multiSig() view returns (address)"];
        const registry = new ethers.Contract(registryAddress, registryAbi, provider);
        const actualGovernance = await registry.multiSig();

        console.log(`\n- NotaryRegistry MultiSig: ${actualGovernance}`);

        if (actualGovernance.toLowerCase() === multiSigAddress.toLowerCase()) {
            console.log(`✅ Governance Alignment: MATCH`);
        } else {
            console.log(`⚠️ Governance Alignment: MISMATCH (Current authority is ${actualGovernance})`);
        }

    } catch (err) {
        console.error(`Audit failed: ${err.message}`);
    }
}

auditMultiSig();
