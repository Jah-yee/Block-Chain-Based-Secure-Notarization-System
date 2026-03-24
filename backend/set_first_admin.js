const pool = require('./src/db/index.js');
const { ethers } = require("ethers");
const { connectBNB } = require("./src/blockchain/connection");

async function setFirstAdmin() {
    try {
        const email = process.argv[2];
        if (!email) {
            console.error("Please provide the email of the target admin account.");
            console.error("Usage: node set_first_admin.js <email>");
            process.exit(1);
        }

        console.log(`🔍 Searching for user with email: ${email}`);
        
        // Find existing user
        const res = await pool.query("SELECT id, wallet_address, role FROM users WHERE email = $1", [email]);
        
        if (res.rows.length === 0) {
            console.error(`❌ No user found. Please register at /signup or /register-notary first.`);
            process.exit(1);
        }
        
        const user = res.rows[0];
        console.log(`👤 Found user! ID: ${user.id}, Wallet: ${user.wallet_address}, Current DB Role: ${user.role}`);

        if (user.role === 'admin') {
            console.log("✅ User is already an admin in the database.");
        } else {
            console.log("🛠️ Promoting user to admin in the database...");
            await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
            console.log("✅ Database promotion successful.");
        }

        // On-chain promotion
        console.log(`\n⛓️ Checking on-chain role for wallet ${user.wallet_address}...`);
        const { provider, signer } = await connectBNB();
        const registryAddress = process.env.NOTARY_REGISTRY_ADDRESS;
        const abi = [
            "function roles(address) view returns (uint8)",
            "function promoteToAdmin(address) external",
            "function getUserRole(address) view returns (uint8)"
        ];
        
        const contract = new ethers.Contract(registryAddress, abi, signer);
        const currentRole = await contract.getUserRole(user.wallet_address);
        
        if (Number(currentRole) === 3) {
            console.log("✅ Wallet is already an admin (Role 3) on the blockchain.");
        } else {
            console.log(`🛠️ Current on-chain role is ${currentRole}. Sending promoteToAdmin transaction...`);
            const tx = await contract.promoteToAdmin(user.wallet_address);
            console.log(`⏳ Transaction Hash: ${tx.hash}`);
            await tx.wait();
            console.log("✅ Blockchain promotion successful!");
        }
        
        console.log("\n🎉 First admin has been successfully set up! You can now log into the Web App and Desktop App as an admin.");
        process.exit(0);

    } catch (e) {
        console.error("❌ Error setting initial admin:", e);
        process.exit(1);
    }
}

setFirstAdmin();
