const { ethers } = require('ethers');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

async function run() {
    const wallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY);
    const address = await wallet.getAddress();
    
    const domain = {
        name: "BBSNS_Protocol",
        version: "1",
        chainId: Number(process.env.CHAIN_ID),
        verifyingContract: process.env.DOCUMENT_REGISTRY_ADDRESS
    };

    const types = {
        Notarize: [
            { name: "docHash", type: "bytes32" },
            { name: "ownerAddress", type: "address" },
            { name: "status", type: "uint8" },
            { name: "summaryHash", type: "bytes32" },
            { name: "rejectionReasonHash", type: "bytes32" },
            { name: "timestamp", type: "uint256" },
            { name: "nonce", type: "uint256" }
        ]
    };

    const message = {
        docHash: ethers.id("test"),
        ownerAddress: address,
        status: 1,
        summaryHash: ethers.ZeroHash,
        rejectionReasonHash: ethers.ZeroHash,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: 0
    };

    console.log("Signing...");
    const sig = await wallet.signTypedData(domain, types, message);
    console.log("Recovering...");
    const recovered = ethers.verifyTypedData(domain, types, message, sig);
    
    console.log(`Original: ${address}`);
    console.log(`Recovered: ${recovered}`);
    console.log(`MATCH: ${address.toLowerCase() === recovered.toLowerCase()}`);
}

run();
