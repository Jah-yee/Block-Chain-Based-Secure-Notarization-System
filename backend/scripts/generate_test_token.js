const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

async function generateToken() {
    const JWT_SECRET = process.env.JWT_SECRET;
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);

    const walletAddress = "0x91ed53552ca83709a06d5763315e09f5fc6cdd30";
    const userId = 1;

    const snapshotBlock = await provider.getBlockNumber();
    const network = await provider.getNetwork();
    const snapshotChainId = Number(network.chainId);

    const token = jwt.sign(
        {
            id: userId,
            address: walletAddress.toLowerCase(),
            role: 0, // OWNER threshold now 0
            snapshotBlock,
            snapshotChainId,
            issuedAt: Date.now()
        },
        JWT_SECRET,
        { expiresIn: '12h' }
    );

    fs.writeFileSync('test_token.txt', token);
    console.log("Token written to test_token.txt");
}

generateToken();
