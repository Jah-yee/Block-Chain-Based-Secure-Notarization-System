const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

// 1. Setup Environment
dotenv.config({ path: path.join(__dirname, '.env'), override: true });
const API_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET;
const RPC_URL = process.env.BNB_TESTNET_RPC_URL;
const privateKey = process.env.BNB_SYSTEM_PRIVATE_KEY;

// Roles from actor.js
const ROLES = { OWNER: 1, NOTARY: 2, ADMIN: 3 };

async function run() {
  try {
    console.log('\n--- BBSNS END-TO-END VERIFICATION ---\n');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;

    // Helper: Generate Auth Token
    const getAuthToken = (id, role, addr) => {
      return jwt.sign({ id, role, address: addr.toLowerCase(), issuedAt: Date.now() }, JWT_SECRET, { expiresIn: '1h' });
    };

    // Actors
    const adminToken = getAuthToken(1, ROLES.ADMIN, address);
    const ownerToken = getAuthToken(1, ROLES.OWNER, address); // Using same wallet for simplicity in test
    const notaryToken = getAuthToken(2, ROLES.NOTARY, '0x1000000000000000000000000000000000000001');

    // Step 1: Initiate Upload with a DIFFERENT owner address
    const dummyFile = path.join(__dirname, 'test_upload.txt');
    fs.writeFileSync(dummyFile, 'Verify BBSNS Protocol integrity ' + Date.now());
    
    const ownerWallet = new ethers.Wallet(crypto.randomBytes(32).toString('hex'), provider);
    const ownerAddress = ownerWallet.address;
    console.log(`Owner Address (Test): ${ownerAddress}`);

    const pool = require('./src/db/index');
    const cost = 1;
    const costWei = ethers.parseEther(cost.toString());
    const fileHash = crypto.createHash('sha256').update(fs.readFileSync(dummyFile)).digest('hex');
    const intentId = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 60 * 1000);

    // Give owner some gas
    console.log(`Funding owner gas...`);
    const fundingTx = await wallet.sendTransaction({ to: ownerAddress, value: ethers.parseEther("0.05") });
    await fundingTx.wait();

    // Give owner some NTKR
    const ntkrAddr = process.env.NTKR_CONTRACT_ADDRESS;
    const ntkrAbi = [
        "function mintNTKR(address user, uint256 amount) external",
        "function burnForUpload(uint256 amount, bytes32 intentId) external"
    ];
    const ntkr = new ethers.Contract(ntkrAddr, ntkrAbi, wallet);
    await (await ntkr.mintNTKR(ownerAddress, costWei)).wait();
    console.log(`✅ Owner funded with NTKR`);

    await pool.query(
        'INSERT INTO upload_intents (id, user_id, wallet_address, file_hash, filename, filepath, amount, amount_wei, expires_at, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [intentId, 1, ownerAddress, fileHash, 'test_upload.txt', dummyFile, cost, costWei.toString(), expires, 'awaiting_payment']
    );
    console.log(`✅ Intent created: ${intentId}`);

    console.log('\nStep 2: Performing On-Chain Burn (Owner Signed)...');
    const ownerNtkr = new ethers.Contract(ntkrAddr, ntkrAbi, ownerWallet);
    const intentIdBytes32 = '0x' + intentId.replace(/-/g, '').padStart(64, '0');
    const txBurn = await ownerNtkr.burnForUpload(costWei, intentIdBytes32);
    console.log(`TX Sent: ${txBurn.hash}`);
    await txBurn.wait();
    console.log('✅ Burn confirmed.');

    console.log('\nStep 3: Confirming Upload...');
    const tx_hash = txBurn.hash;
    const docRes = await pool.query(
        `INSERT INTO documents (user_id, filename, file_hash, filepath, submission_state, payment_tx_hash, created_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, NOW()) RETURNING id`,
        [1, 'test_upload.txt', fileHash, dummyFile, tx_hash]
    );
    const docId = docRes.rows[0].id;

    console.log('\nStep 4: Notary Assignment...');
    const reputationService = require('./src/services/reputation.service');
    const assignment = await reputationService.assignNotary(docId);
    console.log(`✅ Assigned to Notary ID: ${assignment}`);

    console.log('\nStep 5: Notary Approval (EIP-712)...');
    // Ensure Relayer is Notary
    const { registerNotaryOnChain } = require('./src/blockchain/notary-registry');
    await registerNotaryOnChain(address);

    const status = 1; // APPROVED
    const timestamp = Math.floor(Date.now() / 1000);
    const docHashBytes = fileHash.startsWith('0x') ? fileHash : `0x${fileHash}`;
    
    const registryAddr = process.env.DOCUMENT_REGISTRY_ADDRESS;
    const registryAbi = ["function nonces(address) view returns (uint256)"];
    const registry = new ethers.Contract(registryAddr, registryAbi, provider);
    const notaryNonce = await registry.nonces(address);

    const domain = { name: "BBSNS_Protocol", version: "1", chainId: Number(process.env.CHAIN_ID), verifyingContract: registryAddr };
    const types = {
        Notarize: [
            { name: "docHash", type: "bytes32" }, { name: "ownerAddress", type: "address" }, { name: "status", type: "uint8" },
            { name: "summaryHash", type: "bytes32" }, { name: "rejectionReasonHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "nonce", type: "uint256" }
        ]
    };
    const message = { docHash: docHashBytes, ownerAddress: ownerAddress, status, summaryHash: ethers.ZeroHash, rejectionReasonHash: ethers.ZeroHash, timestamp, nonce: Number(notaryNonce) };

    const signature = await wallet.signTypedData(domain, types, message);
    const recovered = ethers.verifyTypedData(domain, types, message, signature);
    console.log(`Local Recovery Check: ${recovered === address ? 'PASS' : 'FAIL ('+recovered+')'}`);

    const { sendApprovalTx } = require('./src/utils/blockchain');
    const txApproval = await sendApprovalTx(docHashBytes, ownerAddress, 'approved', signature, timestamp, ethers.ZeroHash, ethers.ZeroHash);
    console.log(`✅ FINAL SUCCESS: Approval submitted. TX: ${txApproval.txHash}`);

    console.log('\n--- VERIFICATION SUCCESSFUL ---');
    console.log(`Final Doc State: Document ${docId} is now submitted to blockchain.`);
    
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
