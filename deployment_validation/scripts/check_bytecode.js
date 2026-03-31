const { ethers } = require("ethers");
require('dotenv').config({ path: '../.env' });

async function checkCode() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Explicitly log the addresses to see what is being loaded
    console.log("--- LOADED ADDRESSES FROM ENV ---");
    console.log(`NTKR_CONTRACT_ADDRESS: [${process.env.NTKR_CONTRACT_ADDRESS}]`);
    console.log(`NTK_CONTRACT_ADDRESS: [${process.env.NTK_CONTRACT_ADDRESS}]`);
    console.log(`NOTARY_REGISTRY_ADDRESS: [${process.env.NOTARY_REGISTRY_ADDRESS}]`);
    console.log(`DOCUMENT_REGISTRY_ADDRESS: [${process.env.DOCUMENT_REGISTRY_ADDRESS}]`);
    console.log("---------------------------------\n");

    const addresses = {
        NTKR: process.env.NTKR_CONTRACT_ADDRESS,
        NTK: process.env.NTK_CONTRACT_ADDRESS,
        NotaryRegistry: process.env.NOTARY_REGISTRY_ADDRESS,
        DocumentRegistry: process.env.DOCUMENT_REGISTRY_ADDRESS
    };

    for (const [name, addr] of Object.entries(addresses)) {
        if (!addr) {
            console.log(`Checking ${name}: ❌ Address is UNDEFINED!`);
            continue;
        }
        console.log(`Checking ${name} at ${addr}...`);
        try {
            const code = await provider.getCode(addr);
            console.log(`  Code Length: ${code.length}`);
            if (code === '0x' || code === '0x0') {
                console.log(`  ⚠️ NO CODE at this address!`);
            }
        } catch (err) {
            console.log(`  Failed: ${err.message}`);
        }
    }
}

checkCode();
