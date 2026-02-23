import { ethers } from "ethers";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend folder
dotenv.config({ path: path.join(__dirname, "../backend/.env") });

const DEPLOYMENTS_PATH = path.join(__dirname, "deployments.json");
const ABI_DIR = path.join(__dirname, "abi");
const ENV_PATH = path.join(__dirname, "../backend/.env");

/**
 * Automates contract deployment, ABI export, and .env updates.
 */
async function deploy() {
    const rpcUrl = process.env.BNB_TESTNET_RPC_URL;
    const privateKey = process.env.BNB_SYSTEM_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        console.error("❌ Missing BNB_TESTNET_RPC_URL or BNB_SYSTEM_PRIVATE_KEY in .env");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`🚀 Deploying contracts with wallet: ${wallet.address}`);

    if (!fs.existsSync(ABI_DIR)) fs.mkdirSync(ABI_DIR, { recursive: true });

    async function deployContract(contractName, fileName, ...args) {
        // Hardhat artifact path: artifacts/contracts/<FileName>.sol/<ContractName>.json
        const artifactPath = path.join(__dirname, `./artifacts/contracts/${fileName}.sol/${contractName}.json`);
        if (!fs.existsSync(artifactPath)) {
            throw new Error(`Artifact not found at ${artifactPath}. Did you run npx hardhat compile?`);
        }

        const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

        console.log(`📦 Deploying ${contractName} with args: ${args}...`);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();
        const address = await contract.getAddress();

        console.log(`✅ ${contractName} deployed to: ${address}`);

        // Save ABI
        const abiPath = path.join(ABI_DIR, `${contractName}.json`);
        fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
        console.log(`📄 ABI exported to ${abiPath}`);

        return address;
    }

    try {
        // 1. Determine Authorities
        // Relayer Address (The address from which on-chain promotions/approvals happen)
        // From backend/.env, the system relayer address is derived from either the BNB_SYSTEM_PRIVATE_KEY or AWS KMS.
        // For this re-deployment, we use the wallet that is currently deploying (which should match the BNB_SYSTEM_PRIVATE_KEY)
        const relayer = wallet.address;
        const treasury = wallet.address; // Use deployer as initial treasury for simplicity

        console.log(`📡 Relayer/Governance Authority assigned to: ${relayer}`);

        // 2. Deploy Sequence

        // Step A: NotaryRegistry (The authority source)
        // Constructor: address _multiSig
        const notaryRegistryAddress = await deployContract("NotaryRegistry", "NotaryRegistry", relayer);

        // Step B: NTK Token (Operational Fuel)
        // Constructor: address initialRelayer
        const ntkAddress = await deployContract("NTKToken", "NTK", relayer);

        // Step C: NTKR Token (Reputation/Access)
        // Constructor: address initialRelayer, address initialTreasury
        const ntkrAddress = await deployContract("NTKRToken", "NTKR", relayer, treasury);

        // Step D: DocumentRegistry (The record store)
        // Constructor: address _notaryRegistry, address _ntkToken
        const registryAddress = await deployContract("DocumentRegistry", "DocumentRegistry", notaryRegistryAddress, ntkAddress);

        const deployments = {
            network: "bnbTestnet",
            notaryRegistry: notaryRegistryAddress,
            ntkr: ntkrAddress,
            ntk: ntkAddress,
            registry: registryAddress,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2));
        console.log(`\n📂 Deployments saved to ${DEPLOYMENTS_PATH}`);

        // Automate .env update (simple append/replace)
        let envContent = fs.readFileSync(ENV_PATH, "utf8");

        const updateEnv = (key, value) => {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        };

        updateEnv("NOTARY_REGISTRY_ADDRESS", notaryRegistryAddress);
        updateEnv("NTKR_CONTRACT_ADDRESS", ntkrAddress);
        updateEnv("NTK_CONTRACT_ADDRESS", ntkAddress);
        updateEnv("DOCUMENT_REGISTRY_ADDRESS", registryAddress);

        fs.writeFileSync(ENV_PATH, envContent);
        console.log(`🔧 .env updated at ${ENV_PATH}`);

        console.log("\n--- DEPLOYMENT SUCCESSFUL ---");
        console.log(`✅ Relayer ${relayer} now has GOVERNANCE role on NotaryRegistry.`);
    } catch (error) {
        console.error("❌ Deployment failed:", error);
    }
}

deploy();
