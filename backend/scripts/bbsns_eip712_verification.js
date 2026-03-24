const { ethers } = require('ethers');
require('dotenv').config({ override: true });

const API_BASE = "http://localhost:5000";
const RELAYER_KEY = process.env.BNB_SYSTEM_PRIVATE_KEY;
const OWNER_KEY = "0x0000000000000000000000000000000000000000000000000000000000000002";
const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL || process.env.RPC_URL);

async function getAuthToken(wallet, isNotary = false, userId = 1) {
    const jwt = require('jsonwebtoken');
    const currentBlock = await provider.getBlockNumber();
    return jwt.sign({
        id: userId,
        address: wallet.address,
        role: isNotary ? 2 : 1,
        snapshotBlock: currentBlock,
        snapshotChainId: 97,
        issuedAt: Date.now()
    }, process.env.JWT_SECRET);
}

async function run() {
    try {
        console.log("🚀 STARTING FINAL CERTIFICATION");
        const notary = new ethers.Wallet(RELAYER_KEY, provider);
        const owner = new ethers.Wallet(OWNER_KEY, provider);
        const gasPrice = ethers.parseUnits("15", "gwei");

        // Conditional Funding (Conservative)
        const bnbBal = await provider.getBalance(owner.address);
        if (bnbBal < ethers.parseEther("0.01")) {
            console.log("Funding Owner with 0.02 BNB...");
            const tx = await notary.sendTransaction({ to: owner.address, value: ethers.parseEther("0.02"), gasPrice });
            await tx.wait();
        }

        const ntkrAbi = ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
        const ntkr = new ethers.Contract(process.env.NTKR_CONTRACT_ADDRESS, ntkrAbi, notary);
        const ntkrBal = await ntkr.balanceOf(owner.address);
        if (ntkrBal < ethers.parseEther("2")) {
            console.log("Funding Owner with 2 NTKR...");
            const tx = await ntkr.transfer(owner.address, ethers.parseEther("2"), { gasPrice });
            await tx.wait();
        }

        const oToken = await getAuthToken(owner, false, 4);
        const nToken = await getAuthToken(notary, true, 1);

        console.log("STEP 1: Initiate");
        const fd = new FormData();
        fd.append('file', new Blob(['Certification Test Content']), 'cert.txt');
        fd.append('category', '0');

        const initRes = await fetch(`${API_BASE}/api/documents/initiate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${oToken}` },
            body: fd,
            signal: AbortSignal.timeout(15000)
        });
        const initData = await initRes.json();
        if (!initRes.ok) throw new Error(`INIT_FAIL: ${initRes.status} ${JSON.stringify(initData)}`);
        const { intent_id, intent_id_bytes32, amount_wei, ntkr_contract } = initData;
        console.log(`Intent: ${intent_id}`);

        console.log("STEP 2: Burn");
        const ntkrBurn = new ethers.Contract(ntkr_contract, ["function burnForUpload(uint256,bytes32)"], owner);
        const bTx = await ntkrBurn.burnForUpload(amount_wei, intent_id_bytes32, { gasPrice });
        await bTx.wait();
        console.log("Burn Confirmed.");

        console.log("STEP 3: Confirm");
        const cRes = await fetch(`${API_BASE}/api/documents/confirm`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${oToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ intent_id, tx_hash: bTx.hash })
        });
        const cData = await cRes.json();
        if (!cRes.ok) throw new Error(`CONF_FAIL: ${JSON.stringify(cData)}`);
        const docId = cData.document.id;
        console.log(`Doc ID: ${docId}`);

        console.log("STEP 4: Sign Payload");
        // Wait for assignNotary to finish
        await new Promise(r => setTimeout(r, 3000));
        
        const pRes = await fetch(`${API_BASE}/api/documents/${docId}/signature-payload?status=approved&summary=Certified`, {
            headers: { 'Authorization': `Bearer ${nToken}` }
        });
        const pData = await pRes.json();
        if (!pRes.ok) throw new Error(`PAYLOAD_FAIL: ${pRes.status} ${JSON.stringify(pData)}`);
        console.log("Payload Received.");

        console.log("STEP 5: Signing");
        const sig = await notary.signTypedData(pData.domain, pData.types, pData.message);

        console.log("STEP 6: Notarize");
        const nRes = await fetch(`${API_BASE}/api/documents/${docId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${nToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...pData.message,
                status: 'approved',
                signature: sig,
                document_summary: 'Certified'
            })
        });
        const nData = await nRes.json();
        if (!nRes.ok) throw new Error(`NOTARIZE_FAIL: ${JSON.stringify(nData)}`);

        console.log("✅ CERTIFICATION COMPLETE!");
        process.exit(0);

    } catch (e) {
        console.error("❌ FAILED:", e.message);
        process.exit(1);
    }
}

run();
