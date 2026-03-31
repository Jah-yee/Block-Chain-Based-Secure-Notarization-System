const { getTokenContracts, checkBalance } = require("../src/blockchain/tokens");
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    console.log("🔍 Testing Live Token Integration...");
    console.log(`📍 NTK Address: ${process.env.NTK_CONTRACT_ADDRESS}`);
    console.log(`📍 NTKR Address: ${process.env.NTKR_CONTRACT_ADDRESS}`);

    try {
        const { ntkContract, ntkrContract, signer } = await getTokenContracts();
        const systemAddress = await signer.getAddress();
        console.log(`✅ Connection Successful! System Wallet: ${systemAddress}`);

        const ntkName = await ntkContract.name();
        const ntkrName = await ntkrContract.name();
        const ntkSupply = await ntkContract.totalSupply();
        const ntkrSupply = await ntkrContract.totalSupply();

        console.log(`✅ NTK Contract Name: ${ntkName} | Total Supply: ${ethers.formatEther(ntkSupply)} NTK`);
        console.log(`✅ NTKR Contract Name: ${ntkrName} | Total Supply: ${ethers.formatEther(ntkrSupply)} NTKR`);

        const ntkBalance = await checkBalance(systemAddress, 'NTK');
        const ntkrBalance = await checkBalance(systemAddress, 'NTKR');

        console.log(`💰 System NTK Balance: ${ethers.formatEther(ntkBalance)} NTK`);
        console.log(`💰 System NTKR Balance: ${ethers.formatEther(ntkrBalance)} NTKR`);

        console.log("\n🚀 LIVE INTEGRATION SUCCESSFUL!");
    } catch (error) {
        console.error("❌ Live Integration Failed:");
        console.error(error.message);
        process.exit(1);
    }
}

main();
