const { ethers } = require("ethers");
require('dotenv').config({ path: '../.env' });

async function checkContract() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const addresses = {
        NTKR: process.env.NTKR_CONTRACT_ADDRESS,
        NTK: process.env.NTK_CONTRACT_ADDRESS,
        NotaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
        DocumentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS
    };

    const abi = ["function symbol() view returns (string)", "function name() view returns (string)"];

    for (const [name, addr] of Object.entries(addresses)) {
        console.log(`Checking ${name} at ${addr}...`);
        try {
            const contract = new ethers.Contract(addr, abi, provider);
            const sym = await contract.symbol();
            const n = await contract.name();
            console.log(`  Name: ${n}, Symbol: ${sym}`);
        } catch (err) {
            console.log(`  Failed: ${err.message}`);
        }
    }
}

checkContract();
