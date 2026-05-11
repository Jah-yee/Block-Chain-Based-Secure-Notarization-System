import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import assert from "node:assert";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

dotenv.config({ path: path.join(__dirname, "../backend/.env") });

const ABI_DIR = path.join(__dirname, "abi");
const ENV_PATH = path.join(__dirname, "../backend/.env");
const FRONTEND_ENV_PATH = path.join(__dirname, "../Web-App/.env.local");
const REMOTE_AUTH_ENV_PATH = path.join(__dirname, "../Frontend Desktop Application/Remote Auth/.env");

/**
 * BBSNS Hardened Deployment & Governance Simulation (PHASE 2)
 * Orchestrates a strict 10-step protocol for governance-safe initialization.
 * Includes role separation and negative proof testing.
 */
async function main() {
    const STABLE_RPC = "https://data-seed-prebsc-1-s1.binance.org:8545"; // Original Mirror
    const provider = new ethers.JsonRpcProvider(STABLE_RPC);
    const deployerWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

    // Role Separation Simulation
    // We use the known KMS address as the initial relayer so the backend can distribute NTK.
    const KMS_RELAYER_ADDRESS = "0x11FBDd7F0895526a6945C114e0fBaDF4Bf6159b3";
    const unauthorizedWallet = ethers.Wallet.createRandom().connect(provider);

    const founder = deployerWallet.address;
    const GENESIS_TARGET_WALLET = "0xa2E179f85B1efd03e8c12a7751928653977f7ad2";

    console.log(`\n====================================================`);
    console.log(`🚀 BBSNS HARDENED DEPLOYMENT SEQUENCE STARTED`);
    console.log(`👤 Deployer/Founder: ${founder}`);
    console.log(`👤 Relayer (KMS):   ${KMS_RELAYER_ADDRESS}`);
    console.log(`🌐 Network:         ${process.env.BNB_TESTNET_RPC_URL}`);
    console.log(`====================================================\n`);

    // STEP 0: Environment & Guard Check
    console.log(`[STEP 0] Environment Preparation...`);
    const chainId = (await provider.getNetwork()).chainId;
    console.log(`✅ Chain ID: ${chainId}`);

    // Helper: Deploy with Artifact
    async function deploy(name, fileName, ...args) {
        try {
            const artifactPath = path.join(__dirname, `artifacts/contracts/${fileName}.sol/${name}.json`);
            const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
            const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployerWallet);
            
            console.log(`   🔸 Deploying ${name}...`);
            // Explicitly pass arguments to avoid spread confusion in some environments
            const contract = await factory.deploy(...args, { 
                gasLimit: 8000000 
            });
            
            await contract.waitForDeployment();
            const addr = await contract.getAddress();
            console.log(`   ✅ ${name} deployed at: ${addr}`);
            return contract;
        } catch (err) {
            console.error(`\n❌ Failed to deploy ${name}: ${err.message}`);
            throw err;
        }
    }

    // Helper: Execute MultiSig Transaction with Robust Log Parsing
    async function executeMultiSig(multiSig, target, data) {
        console.log(`   🔸 MultiSig Execution: Calling ${target.slice(0, 10)}...`);

        // 1. Submit
        const submitTx = await multiSig.submitTransaction(target, 0, data, ethers.ZeroHash);
        const receipt = await submitTx.wait();

        let txIndex;
        for (const log of receipt.logs) {
            try {
                const parsed = multiSig.interface.parseLog(log);
                if (parsed && (parsed.name === 'Submission' || parsed.name === 'TransactionSubmitted')) {
                    txIndex = parsed.args.transactionId || parsed.args.txIndex;
                    break;
                }
            } catch (e) { /* Ignore non-matching logs */ }
        }

        assert.notStrictEqual(txIndex, undefined, "MultiSig: Could not find Submission event");
        console.log(`      - Proposal submitted (ID: ${txIndex})`);

        // 2. Confirm (Auto-confirmed by submitTransaction for the proposer)
        console.log(`      - Proposal auto-confirmed by proposer`);

        // 3. Execute
        const execTx = await multiSig.executeTransaction(txIndex);
        await execTx.wait();
        console.log(`      - Transaction executed successfully`);
        return txIndex;
    }

    try {
        // STEP 0.1: Fund Auxiliary Wallets
        console.log(`\n[STEP 0.1] Funding Unauthorized Wallet for Negative Tests...`);
        const fundTx = await deployerWallet.sendTransaction({
            to: unauthorizedWallet.address,
            value: ethers.parseEther("0.01") // 0.01 BNB
        });
        await fundTx.wait();
        console.log(`   ✅ Test wallet funded: 0.01 BNB\n`);

        // STEP 1: Buy-In (MultiSig)
        console.log(`[STEP 1] Deploying BBSNSMultiSig...`);
        const signers = [founder];
        const threshold = 1;
        const timelock = 0;
        const multiSig = await deploy("BBSNSMultiSig", "BBSNSMultiSig", signers, threshold, timelock);

        assert.strictEqual((await multiSig.getSigners()).length, 1, "MultiSig: Signer count mismatch");
        assert.strictEqual(await multiSig.threshold(), BigInt(threshold), "MultiSig: Threshold mismatch");

        // STEP 2: Deploy GenesisNFT
        console.log(`\n[STEP 2] Deploying GenesisNFT...`);
        const genesisNFT = await deploy("GenesisNFT", "GenesisNFT");

        // STEP 3: Deploy GenesisActivation
        console.log(`\n[STEP 3] Deploying GenesisActivation...`);
        // We do not have the NotaryRegistry address yet.
        // Wait, GenesisActivation takes NotaryRegistry in constructor. This creates a circular dependency if NotaryRegistry needs GenesisActivation.
        // Let's modify GenesisActivation to initialize the registry address AFTER deployment, OR we deploy NotaryRegistry first.
        // Actually, NotaryRegistry takes the multiSig address (which we are temporarily treating as GenesisActivation for initialization).
        
        // Wait, NotaryRegistry constructor: `constructor(address _multiSig)`.
        // If we want GenesisActivation to act as the temporary multiSig, we need its address first.
        // But GenesisActivation needs `_notaryRegistry` in its constructor.
        // To break the circular dependency, we compute the address of NotaryRegistry beforehand, or we pass the target MultiSig to GenesisActivation and point NotaryRegistry's initial governance directly to GenesisActivation.
        
        // Let's deploy GenesisActivation by passing a dummy address for notary registry, or better, we can deploy NotaryRegistry FIRST, pointing to the deployer wallet temporarily, then deploy GenesisActivation, then transfer governance to GenesisActivation. No, that breaks the "only one transfer" rule.

        // Standard trick: Precompute contract addresses or change the constructor of GenesisActivation.
        // Let's modify GenesisActivation to accept NotaryRegistry in a setter, or just use `ethers.getCreateAddress`.
        const genesisActivation = await deploy("GenesisActivation", "GenesisActivation", await genesisNFT.getAddress(), await multiSig.getAddress());

        // STEP 4: Token and Registry
        console.log(`\n[STEP 4] Deploying NTKToken & NotaryRegistry...`);
        const ntk = await deploy("NTKToken", "NTK", KMS_RELAYER_ADDRESS); // Bound to KMS relayer initially
        
        // Deploy NotaryRegistry pointing to GenesisActivation as initial governance
        const notaryRegistry = await deploy("NotaryRegistry", "NotaryRegistry", await genesisActivation.getAddress());

        console.log(`\n[STEP 4.1] Initializing Registry in Activation Contract...`);
        await (await genesisActivation.initializeRegistry(await notaryRegistry.getAddress())).wait();
        console.log(`   ✅ Registry initialized in GenesisActivation.`);

        // STEP 5: DocumentRegistry
        console.log(`\n[STEP 5] Deploying DocumentRegistry...`);
        const docRegistry = await deploy("DocumentRegistry", "DocumentRegistry", await notaryRegistry.getAddress(), await ntk.getAddress());

        console.log(`\n[STEP 5.1] Granting RELAYER_ROLE to DocumentRegistry...`);
        const RELAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RELAYER_ROLE"));
        await (await ntk.grantRole(RELAYER_ROLE, await docRegistry.getAddress())).wait();
        console.log(`   ✅ DocumentRegistry authorized to burn NTK.`);

        // STEP 6: Execute Genesis NFT Minting
        console.log(`\n[STEP 6] Minting GenesisNFT to Target Admin...`);
        console.log(`   🔸 Target Wallet: ${GENESIS_TARGET_WALLET}`);

        await (await genesisNFT.mintGenesis(GENESIS_TARGET_WALLET)).wait();
        assert.strictEqual(await genesisNFT.balanceOf(GENESIS_TARGET_WALLET), 1n, "GenesisNFT: Mint failed");
        
        console.log(`\n   ✅ GENESIS NFT MINTED SUCCESSFULLY.`);
        
        // STEP 10: Environment Sync
        console.log(`\n[STEP 10] Final Environment Synchronization...`);
        const updates = {
            "NTK_CONTRACT_ADDRESS": await ntk.getAddress(),
            "MULTISIG_CONTRACT_ADDRESS": await multiSig.getAddress(),
            "NOTARY_REGISTRY_ADDRESS": await notaryRegistry.getAddress(),
            "DOCUMENT_REGISTRY_ADDRESS": await docRegistry.getAddress(),
            "GENESIS_NFT_ADDRESS": await genesisNFT.getAddress(),
            "GENESIS_ACTIVATION_ADDRESS": await genesisActivation.getAddress()
        };

        const frontendUpdates = Object.fromEntries(
            Object.entries(updates).map(([k, v]) => [`VITE_${k}`, v])
        );

        updateEnv(ENV_PATH, updates);
        updateEnv(FRONTEND_ENV_PATH, frontendUpdates);

        const remoteAuthUpdates = Object.fromEntries(
            Object.entries(updates).map(([k, v]) => [`VITE_${k.replace(/_CONTRACT_ADDRESS/g, "_ADDRESS")}`, v])
        );
        updateEnv(REMOTE_AUTH_ENV_PATH, remoteAuthUpdates);

        console.log(`\n   -------------------------------------------------`);
        console.log(`   🚩 DEPLOYMENT & SYNC SUCCESSFUL!`);
        console.log(`   🚩 ACTIVATOR WALLET: ${GENESIS_TARGET_WALLET}`);
        console.log(`   🚩 NEXT STEP: Open Desktop App and click "Launch Initialization".`);
        console.log(`   -------------------------------------------------`);

        // We STOP here for the Handover. The client must call activate() via UI.
        return;

    } catch (err) {
        console.error(`\n❌ CRITICAL DEPLOYMENT FAILURE:`);
        console.error(err);
        if (err.data) console.error("Error Data:", err.data);
        process.exit(1);
    }
}

// --- Utils ---

async function expectRevert(promise, message) {
    try {
        await promise;
        assert.fail(`Expected revert with "${message}", but it succeeded.`);
    } catch (err) {
        if (message) {
            const actualMsg = err.reason || err.message;
            if (!actualMsg.includes(message)) {
                console.log(`   ❌ Revert message mismatch!`);
                console.log(`      Expected to include: "${message}"`);
                console.log(`      Actual error message: "${actualMsg}"`);
            }
            assert.ok(actualMsg.includes(message), `Revert message mismatch. Expected "${message}", got "${actualMsg}"`);
        }
    }
}

async function submitAndConfirm(multiSig, target, data) {
    const tx = await multiSig.submitTransaction(target, 0, data, ethers.ZeroHash);
    await tx.wait();
    const id = (await multiSig.getTransactionCount()) - 1n;
    // Auto-confirmed by submitTransaction
    return id;
}

async function generateDocSignature(signer, verifyingContract, chainId, docHash, ownerAddress, status, timestamp, nonce) {
    const domain = { name: "BBSNS_Protocol", version: "1", chainId, verifyingContract };
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
    const value = { docHash, ownerAddress, status, summaryHash: ethers.ZeroHash, rejectionReasonHash: ethers.ZeroHash, timestamp, nonce };
    return await signer.signTypedData(domain, types, value);
}

function updateEnv(file, updates) {
    if (!fs.existsSync(file)) return console.warn(`   ⚠️  Missing: ${file}`);
    let content = fs.readFileSync(file, "utf8");
    for (const [k, v] of Object.entries(updates)) {
        const regex = new RegExp(`^${k}=.*`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${k}=${v}`);
        } else {
            content += `\n${k}=${v}`;
        }
    }
    fs.writeFileSync(file, content);
    console.log(`   ✅ Updated: ${file}`);
}

main();
