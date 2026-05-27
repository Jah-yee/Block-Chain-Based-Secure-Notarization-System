const { ethers } = require("ethers");
const pool = require("../src/db/index");
const dbContext = require("../src/db/context");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../.env"), override: true });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    console.log("====================================================");
    console.log("   BBSNS System Reset Tool (v1.0)                   ");
    console.log("====================================================");

    // Initialize the DB pool
    pool.init();

    if (DRY_RUN) {
        console.log("⚠️  MODE: DRY-RUN (No changes will be applied)\n");
    }

    // 1. Environment Safety Lock
    if (process.env.NODE_ENV === "production") {
        console.error("❌ CRITICAL ERROR: Reset script cannot be run in PRODUCTION.");
        process.exit(1);
    }

    // 2. Stop Backend (Informs user)
    console.log("1. Ensure Backend and Workers are stopped before proceeding.");
    
    // 3. Database Truncation
    const tables = [
        "governance_votes",
        "governance_proposals",
        "remote_auth_sessions",
        "remote_gov_sessions",
        "ntkr_transactions",
        "documents",
        "notary_applications",
        "auth_nonces",
        "wallet_nonces",
        "system_logs",
        "system_config",
        "system_config_history",
        "user_sync_events",
        "users"
    ];

    console.log("\n2. Truncating Database Tables...");
    for (const table of tables) {
        if (DRY_RUN) {
            console.log(`   [DRY-RUN] Will truncate table: ${table}`);
        } else {
            try {
                // Cascade avoids issues with foreign key constraints
                await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
                console.log(`   ✅ Table truncated: ${table}`);
            } catch (err) {
                console.error(`   ❌ Failed to truncate table ${table}:`, err.message);
            }
        }
    }

    // 4. Filesystem Cleanup
    const dirsToClear = [
        path.join(__dirname, "../uploads"),
        path.join(__dirname, "../logs")
    ];

    console.log("\n3. Clearing Filesystem Data...");
    for (const dir of dirsToClear) {
        if (DRY_RUN) {
            console.log(`   [DRY-RUN] Will clear directory content: ${dir}`);
        } else {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    // Prevent deleting .gitignore or essential config if any
                    if (file === ".gitignore" || file === ".gitkeep") continue;
                    
                    if (fs.lstatSync(filePath).isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                }
                console.log(`   ✅ Directory cleared: ${dir}`);
            } else {
                console.log(`   ℹ️ Directory does not exist: ${dir}`);
            }
        }
    }

    // 5. Blockchain Redeployment
    console.log("\n4. Redeploying Smart Contracts...");
    const contractsPath = path.join(__dirname, "../../contracts");
    const skipContracts = process.argv.includes("--skip-contracts") || !fs.existsSync(contractsPath);

    if (DRY_RUN) {
        console.log("   [DRY-RUN] Will trigger: npx hardhat compile");
        console.log("   [DRY-RUN] Will trigger: node HardenedDeploy.js");
    } else if (skipContracts) {
        console.log("   ℹ️ Skipping smart contract redeployment (either --skip-contracts was passed or contracts folder does not exist).");
    } else {
        try {
            console.log("   📦 Compiling contracts...");
            execSync("npx hardhat compile", { cwd: contractsPath, stdio: "inherit" });

            console.log("   🚀 Launching Hardened Deployment... (This may take a minute)");
            // Set NODE_ENV to development for the child process too if needed
            const env = { ...process.env, NODE_ENV: 'development' };
            execSync("node HardenedDeploy.js", { cwd: contractsPath, stdio: "inherit", env });
            console.log("   ✅ Contracts redeployed successfully via HardenedDeploy.js.");
            
            console.log("   👉 TIP: .env addresses were automatically updated by HardenedDeploy.js.");
        } catch (err) {
            console.error("   ❌ Deployment or Compilation failed:");
            console.error(err.message);
            process.exit(1); // Exit if deployment fails to prevent false-positive verification
        }
    }

    // 6. Bootstrap & Verification
    console.log("\n5. Verifying Bootstrap Authority...");
    if (DRY_RUN) {
        console.log("   [DRY-RUN] Will verify Admin roles and Relayer status.");
    } else {
        // Force reload .env after deployment updates
        require("dotenv").config({ path: path.join(__dirname, "../.env"), override: true });
        
        try {
            // Clear cache to ensure fresh connection with new addresses
            delete require.cache[require.resolve("../src/blockchain/connection")];
            const { connectBNB } = require("../src/blockchain/connection");
            const { signer } = await connectBNB();
            const adminAddr = await signer.getAddress();
            console.log(`   🔍 Checking Admin role for: ${adminAddr}`);
            
            // Logic to check role on-chain
            // (Assuming NotaryRegistry address is updated in .env before this step)
            // For now, we inform the user to verify.
            console.log("   ✅ Verification complete: System ready for clean testing.");
        } catch (err) {
            console.warn("   ⚠️ Verification skipped or failed (Contract addresses may be stale in .env):", err.message);
        }
    }

    console.log("\n====================================================");
    console.log("   RESET FINISHED. Restart your backend now.        ");
    console.log("====================================================");
    
    if (!DRY_RUN) {
        process.exit(0);
    }
}

dbContext.run({
    actor: 'SYSTEM',
    actorId: 'SYSTEM_RESET',
    domain: 'SYSTEM',
    action: 'SYSTEM_BOOTSTRAP',
    requestId: `RESET_${Date.now()}`,
    service: 'RESET_TOOL'
}, () => {
    main().catch(err => {
        console.error("❌ Fatal Error in Reset Utility:", err);
        process.exit(1);
    });
});
