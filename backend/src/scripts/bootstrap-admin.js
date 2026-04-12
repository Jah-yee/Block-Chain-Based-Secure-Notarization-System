require('dotenv').config({ path: 'backend/.env' });
const pool = require('../db/index.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function bootstrap() {
    pool.init();
    const client = await pool.connect();
    try {
        console.log("🛠️ Starting Admin Bootstrap...");

        const email = process.argv[2] || "admin@bbsns.online";
        const password = process.argv[3] || "Admin@123456";
        const wallet = process.argv[4] || "0x0000000000000000000000000000000000000000";

        // Check if admin already exists
        const existing = await client.query("SELECT id FROM users WHERE role = 'admin' OR email = $1", [email]);
        if (existing.rows.length > 0) {
            console.log("ℹ️ Admin user already exists. Skipping bootstrap.");
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Use a system context for the bootstrap (avoids audit trigger issues during setup)
        await client.query("SELECT set_config('app.user_id', '0', true)");
        await client.query("SELECT set_config('app.reason', 'GENESIS_BOOTSTRAP', true)");

        await client.query(`
            INSERT INTO users (username, email, password_hash, role, wallet_address, identity_state, is_verified)
            VALUES ($1, $1, $2, 'admin', $3, 'ACTIVE', true)
        `, [email, hashedPassword, wallet.toLowerCase()]);

        console.log("✅ Admin Bootstrap Successful!");
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${password}`);
        console.log(`👛 Wallet: ${wallet}`);
        console.log("---");
        console.log("IMPORTANT: Log in and change your password immediately.");

    } catch (err) {
        console.error("❌ Bootstrap Failed:", err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

bootstrap();
