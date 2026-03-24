const { ethers } = require('ethers');

async function testMismatch() {
    const NOTARY_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"; // Test key
    const wallet = new ethers.Wallet(NOTARY_PRIVATE_KEY);
    const notaryAddr = wallet.address;

    const domain = {
        name: "BBSNS_Protocol",
        version: "1",
        chainId: 97,
        verifyingContract: "0x52A83224F03aFE983C7672A9f0A04FE423766402"
    };

    // --- FRONTEND VERSION ---
    const frontendTypes = {
        Notarize: [
            { name: 'docHash', type: 'bytes32' },
            { name: 'status', type: 'uint8' },
            { name: 'summaryHash', type: 'bytes32' },
            { name: 'rejectionReasonHash', type: 'bytes32' },
            { name: 'timestamp', type: 'uint256' }
        ]
    };

    const frontendValue = {
        docHash: ethers.id("testdoc"),
        status: 1,
        summaryHash: ethers.id("summary"),
        rejectionReasonHash: ethers.id("none"),
        timestamp: 123456789
    };

    const signature = await wallet.signTypedData(domain, frontendTypes, frontendValue);
    console.log("Frontend Signature Generated.");

    // --- CONTRACT VERSION (Expected) ---
    const contractTypes = {
        Notarize: [
            { name: 'docHash', type: 'bytes32' },
            { name: 'ownerAddress', type: 'address' },
            { name: 'status', type: 'uint8' },
            { name: 'summaryHash', type: 'bytes32' },
            { name: 'rejectionReasonHash', type: 'bytes32' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'nonce', type: 'uint256' }
        ]
    };

    const contractValue = {
        docHash: frontendValue.docHash,
        ownerAddress: "0x0000000000000000000000000000000000000000", // Not in frontend!
        status: frontendValue.status,
        summaryHash: frontendValue.summaryHash,
        rejectionReasonHash: frontendValue.rejectionReasonHash,
        timestamp: frontendValue.timestamp,
        nonce: 0 // Not in frontend!
    };

    // Recover using Contract Types but Frontend Signature
    try {
        const recovered = ethers.verifyTypedData(domain, contractTypes, contractValue, signature);
        console.log(`Recovered Address: ${recovered}`);
        console.log(`Original Address:  ${notaryAddr}`);
        console.log(`MATCH: ${recovered.toLowerCase() === notaryAddr.toLowerCase()}`);
    } catch (e) {
        console.log("Recovery failed as expected due to type mismatch.");
        console.log("Error:", e.message);
    }
}

testMismatch();
