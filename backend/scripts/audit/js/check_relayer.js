const { ethers } = require("ethers");
require("dotenv").config();

async function checkRelayer() {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const privateKey = process.env.BNB_SYSTEM_PRIVATE_KEY;
        const wallet = new ethers.Wallet(privateKey, provider);
        const signerAddress = wallet.address;

        console.log("Signer Address (from .env):", signerAddress);

        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
        const abi = [
            "function relayer() view returns (address)",
            "function owner() view returns (address)",
            "function multiSig() view returns (address)"
        ];
        const contract = new ethers.Contract(registryAddress, abi, provider);

        const [currentRelayer, currentOwner, currentMultiSig] = await Promise.all([
            contract.relayer(),
            contract.owner().catch(() => "N/A"),
            contract.multiSig().catch(() => "N/A")
        ]);

        console.log("Current Relayer on Contract:", currentRelayer);
        console.log("Current MultiSig on Contract:", currentMultiSig);
        console.log("Current Owner on Contract:", currentOwner);

        if (currentMultiSig.toLowerCase() === signerAddress.toLowerCase()) {
            console.log("✅ Signer is MultiSig.");
        } else {
            console.log("❌ Signer is NOT MultiSig.");
        }

        if (currentRelayer.toLowerCase() === signerAddress.toLowerCase()) {
            console.log("✅ Signer is Relayer.");
        } else {
            console.log("❌ Signer is NOT Relayer.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Check failed:", err);
        process.exit(1);
    }
}

checkRelayer();
