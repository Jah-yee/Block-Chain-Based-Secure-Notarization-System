const { ethers } = require("ethers");
require('dotenv').config();

async function checkNTKR() {
    const ntkrAddress = "0xfa0B6490f5807496fC4C9ff516de81cCb7B8551C"; // From deployments.json
    console.log(`Checking NTKR at: ${ntkrAddress}`);

    try {
        const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
        const ntkrContract = new ethers.Contract(ntkrAddress, ["function name() view returns (string)", "function symbol() view returns (string)"], provider);

        const name = await ntkrContract.name();
        console.log(`NTKR Name: ${name}`);

        const symbol = await ntkrContract.symbol();
        console.log(`NTKR Symbol: ${symbol}`);

    } catch (err) {
        console.error("NTKR Check Failed:", err);
    }
}

checkNTKR();
