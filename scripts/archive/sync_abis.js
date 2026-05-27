const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, 'contracts/artifacts/contracts');
const BACKEND_ABI_DIR = path.join(__dirname, 'backend/src/artifacts');
const WEBAPP_ABI_DIR = path.join(__dirname, 'Web-App/lib/abi'); // Assumed location if they add it, or we just copy to backend for now

console.log("🔄 Starting ABI Synchronization...");

// Helper to copy a file
function copyAbi(contractName, destDir) {
    let fileName = contractName;
    if (contractName === 'NTKToken') fileName = 'NTK';
    if (contractName === 'NTKRToken') fileName = 'NTKR';

    const srcPath = path.join(ARTIFACTS_DIR, `${fileName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(srcPath)) {
        console.warn(`⚠️ Warning: Artifact for ${contractName} not found at ${srcPath}`);
        return;
    }
    
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const destPath = path.join(destDir, `${contractName}.json`);
    fs.copyFileSync(srcPath, destPath);
    console.log(`✅ Copied ${contractName}.json to ${destDir}`);
}

const contractsToSync = [
    "BBSNSMultiSig",
    "GenesisNFT",
    "GenesisActivation",
    "NTKToken",
    "NTKRToken",
    "NotaryRegistry",
    "DocumentRegistry"
];

contractsToSync.forEach(contract => {
    copyAbi(contract, BACKEND_ABI_DIR);
});

console.log("🎉 ABI Synchronization Complete!");
