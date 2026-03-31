const { ethers } = require("ethers");
require("dotenv").config({ override: true });

async function checkRpc() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    console.log("Testing RPC URL:", rpcUrl);

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const network = await provider.getNetwork();
        console.log("✅ Connected to network:", network.name, "Chain ID:", network.chainId);
    } catch (error) {
        console.error("❌ RPC Connection Failed:", error.message);
    }
}

checkRpc();
