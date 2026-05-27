const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 🔒 BBSNS Automated Production SAFE Synchronization Utility
// This script parses ONLY the smart contract addresses from your local `.env` file
// and selectively patches them into the production EC2 `.env` file, leaving all 
// server-specific variables (like DATABASE_URL, port 5432, JWT secrets, etc.) completely intact!

const PEM_PATH = "C:\\Users\\Lenovo\\.ssh\\bbsns-keys.pem";
const EC2_HOST = "13.203.121.127";
const EC2_USER = "ubuntu";
const LOCAL_ENV = path.join(__dirname, "backend/.env");

const CONTRACT_KEYS = [
    "NTKR_CONTRACT_ADDRESS",
    "NTK_CONTRACT_ADDRESS",
    "MULTISIG_CONTRACT_ADDRESS",
    "NOTARY_REGISTRY_ADDRESS",
    "DOCUMENT_REGISTRY_ADDRESS",
    "GENESIS_NFT_ADDRESS",
    "GENESIS_ACTIVATION_ADDRESS"
];

async function main() {
    console.log("\n==================================================");
    console.log("🛡️  BBSNS SAFE PRODUCTION ENVIRONMENT SYNC");
    console.log("==================================================\n");

    try {
        // 1. Verify Local .env exists
        if (!fs.existsSync(LOCAL_ENV)) {
            throw new Error(`Local .env not found at: ${LOCAL_ENV}`);
        }
        
        // 2. Parse contract addresses from local .env
        const localContent = fs.readFileSync(LOCAL_ENV, 'utf8');
        const localUpdates = {};
        
        localContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const val = match[2].trim();
                if (CONTRACT_KEYS.includes(key)) {
                    localUpdates[key] = val;
                }
            }
        });

        console.log("🎯 Contract Addresses parsed from local .env:");
        console.table(localUpdates);

        if (Object.keys(localUpdates).length === 0) {
            throw new Error("No contract address keys found in local .env to sync.");
        }

        // 3. Read remote .env file
        console.log("\nStep 1: Reading remote .env from EC2...");
        const readCmd = `ssh -i "${PEM_PATH}" ${EC2_USER}@${EC2_HOST} "cat /home/ubuntu/backend/.env"`;
        const remoteContent = execSync(readCmd, { encoding: 'utf8' });

        // 4. Update ONLY the contract address keys in the remote content
        let remoteLines = remoteContent.split('\n');
        const updatedKeys = new Set();

        remoteLines = remoteLines.map(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                if (localUpdates[key] !== undefined) {
                    updatedKeys.add(key);
                    return `${key}=${localUpdates[key]}`;
                }
            }
            return line;
        });

        // Add any missing keys
        CONTRACT_KEYS.forEach(key => {
            if (!updatedKeys.has(key)) {
                remoteLines.push(`${key}=${localUpdates[key]}`);
            }
        });

        const finalRemoteContent = remoteLines.join('\n');

        // 5. Write back the updated remote .env securely
        console.log("\nStep 2: Uploading patched .env to EC2...");
        const tempLocalFile = path.join(__dirname, "backend/.env.tmp");
        fs.writeFileSync(tempLocalFile, finalRemoteContent, 'utf8');

        const scpCmd = `scp -i "${PEM_PATH}" "${tempLocalFile}" ${EC2_USER}@${EC2_HOST}:/home/ubuntu/backend/.env`;
        execSync(scpCmd, { stdio: 'inherit' });
        fs.unlinkSync(tempLocalFile); // Clean up temp file
        console.log("✅ Successfully patched remote .env with zero pollution.");

        // 6. Restart backend via PM2 with --update-env to load new contract addresses
        console.log("\nStep 3: Restarting remote backend with environment updates...");
        const sshCmd = `ssh -i "${PEM_PATH}" ${EC2_USER}@${EC2_HOST} "pm2 restart bbsns-backend --update-env"`;
        execSync(sshCmd, { stdio: 'inherit' });
        console.log("✅ Successfully restarted backend on EC2 with updated environment variables.");

        console.log("\n==================================================");
        console.log("🎉 SAFE PRODUCTION SYNCHRONIZATION COMPLETE!");
        console.log("Only contract addresses were modified. Server configs are untouched.");
        console.log("==================================================\n");

    } catch (error) {
        console.error("\n❌ Safe Sync Failed:", error.message);
        process.exit(1);
    }
}

main();
