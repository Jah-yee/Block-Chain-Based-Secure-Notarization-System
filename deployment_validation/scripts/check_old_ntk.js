const { ethers } = require("ethers");
require('dotenv').config();

async function checkOldNTK() {
    const ntkAddress = "0x56f1be37bcf831Cb3b2a2Ff048346C1B76B2ABdb"; // OLD .env value
    console.log(`Checking OLD NTK at: ${ntkAddress}`);

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const ntkContract = new ethers.Contract(ntkAddress, ["function name() view returns (string)", "function symbol() view returns (string)"], provider);

        const name = await ntkContract.name();
        console.log(`NTK Name: ${name}`);

        const symbol = await ntkContract.symbol();
        console.log(`NTK Symbol: ${symbol}`);

    } catch (err) {
        console.error("Old NTK Check Failed:", err);
    }
}

checkOldNTK();
