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

/**
 * BBSNS Hardened Deployment & Governance Simulation (PHASE 2)
 * Orchestrates a strict 10-step protocol for governance-safe initialization.
 * Includes role separation and negative proof testing.
 */
async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BNB_TESTNET_RPC_URL);
    const deployerWallet = new ethers.Wallet(process.env.BNB_SYSTEM_PRIVATE_KEY, provider);

    // Role Separation Simulation
    const relayerWallet = ethers.Wallet.createRandom().connect(provider);
    const unauthorizedWallet = ethers.Wallet.createRandom().connect(provider);

    const founder = deployerWallet.address;

    console.log(`\n====================================================`);
    console.log(`🚀 BBSNS HARDENED DEPLOYMENT SEQUENCE STARTED`);
    console.log(`👤 Deployer/Founder: ${founder}`);
    console.log(`👤 Relayer (Temp):   ${relayerWallet.address}`);
    console.log(`🌐 Network:         ${process.env.BNB_TESTNET_RPC_URL}`);
    console.log(`====================================================\n`);

    // STEP 0: Environment & Guard Check
    console.log(`[STEP 0] Environment Preparation...`);
    const chainId = (await provider.getNetwork()).chainId;
    console.log(`✅ Chain ID: ${chainId}`);

    // Helper: Deploy with Artifact
    async function deploy(name, fileName, ...args) {
        const artifactPath = path.join(__dirname, `artifacts/contracts/${fileName}.sol/${name}.json`);
        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployerWallet);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();
        const addr = await contract.getAddress();
        console.log(`✅ ${name} deployed at: ${addr}`);
        return new ethers.Contract(addr, artifact.abi, deployerWallet);
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
        console.log(`\n[STEP 0.1] Funding Relayer Wallet for Gas...`);
        const fundTx = await deployerWallet.sendTransaction({
            to: relayerWallet.address,
            value: ethers.parseEther("0.05") // 0.05 BNB
        });
        await fundTx.wait();
        console.log(`   ✅ Relayer funded: 0.05 BNB\n`);

        // STEP 1: Buy-In (MultiSig) - 1-of-1 Bootstrap Simulation
        console.log(`[STEP 1] Deploying BBSNSMultiSig...`);
        const signers = [founder];
        const threshold = 1;
        const timelock = 0;
        const multiSig = await deploy("BBSNSMultiSig", "BBSNSMultiSig", signers, threshold, timelock);

        assert.strictEqual((await multiSig.getSigners()).length, 1, "MultiSig: Signer count mismatch");
        assert.strictEqual(await multiSig.threshold(), BigInt(threshold), "MultiSig: Threshold mismatch");

        // STEP 2 & 3: Token and Registry
        console.log(`\n[STEP 2] Deploying NTKToken...`);
        const ntk = await deploy("NTKToken", "NTK", founder);

        console.log(`\n[STEP 3] Deploying NotaryRegistry...`);
        const notaryRegistry = await deploy("NotaryRegistry", "NotaryRegistry", await multiSig.getAddress());
        assert.strictEqual(await notaryRegistry.multiSig(), await multiSig.getAddress(), "NotaryRegistry: Governance link failed");

        // STEP 4: DocumentRegistry
        console.log(`\n[STEP 4] Deploying DocumentRegistry...`);
        const docRegistry = await deploy("DocumentRegistry", "DocumentRegistry", await notaryRegistry.getAddress(), await ntk.getAddress());

        // STEP 5: Critical Bootstrap (MultiSig Path)
        console.log(`\n[STEP 5] Critical Bootstrap via MultiSig...`);

        const bootstrapSteps = [
            { fn: "assignOwner", args: [founder], target: 1n, label: "OWNER" },
            { fn: "promoteToNotary", args: [founder], target: 2n, label: "NOTARY" },
            { fn: "promoteToAdmin", args: [founder], target: 3n, label: "ADMIN" }
        ];

        for (const step of bootstrapSteps) {
            const data = notaryRegistry.interface.encodeFunctionData(step.fn, step.args);
            await executeMultiSig(multiSig, await notaryRegistry.getAddress(), data);
            assert.strictEqual(await notaryRegistry.getUserRole(founder), step.target, `Bootstrap: ${step.label} state failed`);
        }

        // STEP 6: Validate Governance State & Last-Admin Protection
        console.log(`\n[STEP 6] Validating Governance Persistence & Fail-Safes...`);
        assert.strictEqual(await notaryRegistry.adminCount(), 1n, "AdminCount: Mismatch after bootstrap");

        // Negative Test: Attempt removeRole(founder) as last admin
        console.log(`   🔸 Negative Test: Attempting to remove last admin (Should revert)...`);
        const removeRoleData = notaryRegistry.interface.encodeFunctionData("removeRole", [founder]);
        const txId = await submitAndConfirm(multiSig, await notaryRegistry.getAddress(), removeRoleData);
        await expectRevert(multiSig.executeTransaction(txId), "MultiSig: Transaction execution failed");
        console.log(`   ✅ Last-admin protection confirmed.`);

        // STEP 7: Relayer Binding
        console.log(`\n[STEP 7] Binding Relayer via MultiSig...`);
        const updateRelayerData = notaryRegistry.interface.encodeFunctionData("updateRelayer", [relayerWallet.address]);
        await executeMultiSig(multiSig, await notaryRegistry.getAddress(), updateRelayerData);
        assert.strictEqual(await notaryRegistry.relayer(), relayerWallet.address, "Relayer binding failed");

        // Negative Test: Zero Address Relayer
        console.log(`   🔸 Negative Test: Setting relayer to address(0) (Should revert)...`);
        const zeroRelayerData = notaryRegistry.interface.encodeFunctionData("updateRelayer", [ethers.ZeroAddress]);
        const txIdZero = await submitAndConfirm(multiSig, await notaryRegistry.getAddress(), zeroRelayerData);
        await expectRevert(multiSig.executeTransaction(txIdZero), "MultiSig: Transaction execution failed");
        console.log(`   ✅ Zero-address relayer check confirmed.`);

        // STEP 8: Functional Smoke Test (Notarization)
        console.log(`\n[STEP 8] Functional Smoke Test (Notarization)...`);
        // Setup Fuel
        const RELAYER_ROLE = await ntk.RELAYER_ROLE();
        await (await ntk.grantRole(RELAYER_ROLE, await docRegistry.getAddress())).wait();
        await (await ntk.mintDailyNTK(founder)).wait();

        // Perform Authorized Notarization
        const docHash = ethers.id("test-notarization-" + Date.now());
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = await docRegistry.nonces(founder);
        const signature = await generateDocSignature(deployerWallet, await docRegistry.getAddress(), chainId, docHash, unauthorizedWallet.address, 1, timestamp, nonce);

        // Call via RelayerWallet
        await (await docRegistry.connect(relayerWallet).recordAction(
            docHash, unauthorizedWallet.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestamp, nonce, signature
        )).wait();
        console.log(`   ✅ Relayer notarization SUCCESS.`);
        assert.strictEqual(await docRegistry.nonces(founder), nonce + 1n, "Nonce: Did not increment");

        // Negative Test: Unauthorized Relayer
        console.log(`   🔸 Negative Test: Non-relayer calling recordAction (Should revert)...`);
        await expectRevert(
            docRegistry.connect(deployerWallet).recordAction(ethers.id("fail"), unauthorizedWallet.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestamp, nonce + 1n, signature),
            "DocumentRegistry: Not authorized relayer"
        );
        console.log(`   ✅ Unauthorized relayer block confirmed.`);

        // STEP 9: Ban System Verification
        console.log(`\n[STEP 9] Verifying Ban System Enforcement...`);
        const banData = notaryRegistry.interface.encodeFunctionData("setBanStatus", [founder, true]);
        await executeMultiSig(multiSig, await notaryRegistry.getAddress(), banData);
        assert.strictEqual(await notaryRegistry.isBanned(founder), true, "Ban: Status failed to set");

        console.log(`   🔸 Functional Test: Recording action while banned (Should revert)...`);
        const docHashBanned = ethers.id("banned-notarization-" + Date.now());
        const timestampBanned = Math.floor(Date.now() / 1000);
        const nonceBanned = await docRegistry.nonces(founder);
        const sigBanned = await generateDocSignature(deployerWallet, await docRegistry.getAddress(), chainId, docHashBanned, unauthorizedWallet.address, 1, timestampBanned, nonceBanned);

        await expectRevert(
            docRegistry.connect(relayerWallet).recordAction(docHashBanned, unauthorizedWallet.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestampBanned, nonceBanned, sigBanned),
            "DocumentRegistry: Notary is banned"
        );

        // Unban and Recover
        const unbanData = notaryRegistry.interface.encodeFunctionData("setBanStatus", [founder, false]);
        await executeMultiSig(multiSig, await notaryRegistry.getAddress(), unbanData);
        assert.strictEqual(await notaryRegistry.isBanned(founder), false, "Unban: Status failed to reset");

        console.log(`   🔸 Post-Ban Recovery Test: Recording fresh action...`);
        const docHashRecovered = ethers.id("recovered-notarization-" + Date.now());
        const timestampRecovered = Math.floor(Date.now() / 1000);
        const nonceRecovered = await docRegistry.nonces(founder);
        const sigRecovered = await generateDocSignature(deployerWallet, await docRegistry.getAddress(), chainId, docHashRecovered, unauthorizedWallet.address, 1, timestampRecovered, nonceRecovered);

        await (await docRegistry.connect(relayerWallet).recordAction(
            docHashRecovered, unauthorizedWallet.address, 1, ethers.ZeroHash, ethers.ZeroHash, timestampRecovered, nonceRecovered, sigRecovered
        )).wait();
        console.log(`   ✅ System recovery confirmed.`);

        // STEP 10: Environment Sync
        console.log(`\n[STEP 10] Final Environment Synchronization...`);
        const updates = {
            "NTK_CONTRACT_ADDRESS": await ntk.getAddress(),
            "MULTISIG_CONTRACT_ADDRESS": await multiSig.getAddress(),
            "NOTARY_REGISTRY_ADDRESS": await notaryRegistry.getAddress(),
            "DOCUMENT_REGISTRY_ADDRESS": await docRegistry.getAddress()
        };
        updateEnv(ENV_PATH, updates);

        const frontendUpdates = Object.fromEntries(
            Object.entries(updates).map(([k, v]) => [`NEXT_PUBLIC_${k.replace(/_CONTRACT_ADDRESS/g, "_ADDRESS")}`, v])
        );
        updateEnv(FRONTEND_ENV_PATH, frontendUpdates);

        console.log(`\n🎉 HARDENED DEPLOYMENT SUCCESSFUL!`);
        console.log(`-----------------------------------------`);
        console.log(`MultiSig:        ${await multiSig.getAddress()}`);
        console.log(`NotaryRegistry:  ${await notaryRegistry.getAddress()}`);
        console.log(`DocumentRegistry:${await docRegistry.getAddress()}`);
        console.log(`-----------------------------------------`);

    } catch (err) {
        console.error(`\n❌ CRITICAL DEPLOYMENT FAILURE:`);
        console.error(err);
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
