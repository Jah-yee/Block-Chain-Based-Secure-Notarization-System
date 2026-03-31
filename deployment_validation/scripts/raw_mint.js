const { ethers } = require("ethers");
const { connectBNB } = require("../src/blockchain/connection");
const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
console.log(`Loading .env from: ${dotenvPath}`);
const result = require('dotenv').config({ path: dotenvPath, override: true });
console.log('Dotenv Result:', result.error || 'SUCCESS');
console.log('NTKR_ADDRESS from process.env:', process.env.NTKR_CONTRACT_ADDRESS);

async function rawMint(targetWallet, amount = 1) {
    console.log(`🚀 Raw Minting ${amount} NTKR to ${targetWallet}...`);
    try {
        const { provider, signer } = await connectBNB();
        const ntkAddress = process.env.NTKR_CONTRACT_ADDRESS;
        const abi = [
            "function mintNTKR(address user, uint256 amount) external",
            "function balanceOf(address) view returns (uint256)",
            "function lastMintedAt(address) view returns (uint256)",
            "function MAX_PER_USER() view returns (uint256)"
        ];

        const contract = new ethers.Contract(ntkAddress, abi, signer);

        const bal = await contract.balanceOf(targetWallet);
        const max = await contract.MAX_PER_USER();
        const last = await contract.lastMintedAt(targetWallet);

        console.log(`Current Balance: ${ethers.formatEther(bal)}`);
        console.log(`Max Per User: ${ethers.formatEther(max)}`);
        console.log(`Last Minted At: ${last.toString()}`);

        const amountWei = ethers.parseUnits(amount.toString(), 18);
        console.log(`Sending TX with amount: ${amountWei.toString()}...`);

        const tx = await contract.mintNTKR(targetWallet, amountWei);
        console.log(`TX Hash: ${tx.hash}`);
        await tx.wait();
        console.log("✅ SUCCESS!");

    } catch (err) {
        console.error("❌ FAILED:", err.message);
        if (err.info?.error) console.error("Revert:", err.info.error.message);
    }
}

const target = process.argv[2] || ethers.Wallet.createRandom().address;
const amount = process.argv[3] || 1;
rawMint(target, amount);
