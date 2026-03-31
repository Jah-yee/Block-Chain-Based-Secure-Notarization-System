const pkg = require('pg');
const { Pool } = pkg;
const jwt = require('jsonwebtoken');
const path = require('path');

const envPath = '/home/ubuntu/backend/.env';
require('dotenv').config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function setup() {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error(`JWT_SECRET not found in ${envPath}`);
        }

        console.log('--- STEP 0: PROVISIONING USERS ---');
        // Added dummy password_hash to satisfy NOT NULL constraint
        const dummyHash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // "password"
        const sql = `
            INSERT INTO users (username, email, role, wallet_address, identity_state, password_hash)
            VALUES 
            ('test_owner', 'test_owner@bbsns.com', 'owner', '0x000000000000000000000000000000000000dEaD', 'ACTIVE', '${dummyHash}'),
            ('test_notary', 'test_notary@bbsns.com', 'notary', '0x0000000000000000000000000000000000000001', 'ACTIVE', '${dummyHash}')
            ON CONFLICT (email) DO UPDATE SET identity_state = 'ACTIVE'
            RETURNING id, email, role, wallet_address;
        `;
        const res = await pool.query(sql);
        const users = res.rows;
        console.log('Users Provisioned:', JSON.stringify(users));

        console.log('\n--- STEP 1: GENERATING JWT TOKENS ---');
        const JWT_SECRET = process.env.JWT_SECRET;
        const snapshotBlock = 30000000;
        const snapshotChainId = 97;

        users.forEach(user => {
            const numericRole = user.role === 'owner' ? 1 : 2;
            const token = jwt.sign(
                {
                    id: user.id,
                    address: user.wallet_address.toLowerCase(),
                    role: numericRole,
                    snapshotBlock,
                    snapshotChainId,
                    issuedAt: Date.now()
                },
                JWT_SECRET,
                { expiresIn: '1h' }
            );
            console.log(`TOKEN_FOR_${user.role.toUpperCase()}=${token}`);
        });

        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Setup Failed:', err.message);
        process.exit(1);
    }
}

setup();
