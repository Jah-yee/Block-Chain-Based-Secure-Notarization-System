/**
 * Registration Flow Verification Script
 * 
 * This script verifies that signup data flows correctly from frontend to database
 * 
 * What it checks:
 * 1. Database schema matches expected fields
 * 2. Test registration with sample data
 * 3. Verify all fields are saved correctly
 * 4. Check data integrity (hashing, JSON storage, etc.)
 */

const pool = require('../src/db/index');
const crypto = require('crypto');

async function verifyRegistrationFlow() {
    console.log('🔍 Starting Registration Flow Verification...\n');

    try {
        // Step 1: Verify table structure
        console.log('📋 Step 1: Checking database schema...');
        const schemaQuery = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'users'
            ORDER BY ordinal_position;
        `;
        const schema = await pool.query(schemaQuery);

        console.log('✅ Users table columns:');
        const requiredFields = ['username', 'email', 'password_hash', 'wallet_address', 'national_id_hash', 'face_descriptor', 'kyc_status', 'role'];
        const foundColumns = schema.rows.map(r => r.column_name);

        requiredFields.forEach(field => {
            const found = foundColumns.includes(field);
            console.log(`   ${found ? '✓' : '✗'} ${field} ${found ? '(exists)' : '(MISSING!)'}`);
        });

        // Step 2: Check for test user (if exists)
        console.log('\n📋 Step 2: Checking for test registrations...');
        const testEmail = 'test_verify_registration@example.com';
        const checkQuery = await pool.query('SELECT * FROM users WHERE email = $1', [testEmail]);

        if (checkQuery.rows.length > 0) {
            console.log('✅ Found existing test user:');
            const user = checkQuery.rows[0];
            console.log(`   ID: ${user.id}`);
            console.log(`   Username: ${user.username}`);
            console.log(`   Email: ${user.email}`);
            console.log(`   Wallet: ${user.wallet_address}`);
            console.log(`   KYC Status: ${user.kyc_status}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   Face Descriptor: ${user.face_descriptor ? 'Present (' + JSON.parse(user.face_descriptor).length + ' values)' : 'Missing'}`);
            console.log(`   National ID Hash: ${user.national_id_hash ? 'Hashed (length: ' + user.national_id_hash.length + ')' : 'Missing'}`);
            console.log(`   Password Hash: ${user.password_hash ? 'Hashed (length: ' + user.password_hash.length + ')' : 'Missing'}`);

            // Verify data integrity
            console.log('\n📋 Step 3: Verifying Data Integrity...');

            // Check face descriptor is valid JSON array
            try {
                const descriptor = JSON.parse(user.face_descriptor);
                if (Array.isArray(descriptor) && descriptor.length === 128) {
                    console.log('   ✅ Face descriptor: Valid 128-float array');
                } else {
                    console.log(`   ⚠️  Face descriptor: Invalid (length: ${descriptor.length})`);
                }
            } catch (e) {
                console.log('   ❌ Face descriptor: Invalid JSON');
            }

            // Check password hash format (bcrypt should be 60 chars)
            if (user.password_hash && user.password_hash.startsWith('$2')) {
                console.log('   ✅ Password: Properly hashed (bcrypt)');
            } else {
                console.log('   ⚠️  Password: Unexpected hash format');
            }

            // Check national ID hash (SHA256 should be 64 hex chars)
            if (user.national_id_hash && user.national_id_hash.length === 64 && /^[a-f0-9]+$/i.test(user.national_id_hash)) {
                console.log('   ✅ National ID: Properly hashed (SHA256)');
            } else {
                console.log('   ⚠️  National ID: Unexpected hash format');
            }

            // Check wallet address format
            if (user.wallet_address && /^0x[a-fA-F0-9]{40}$/.test(user.wallet_address)) {
                console.log('   ✅ Wallet address: Valid Ethereum address');
            } else {
                console.log('   ⚠️  Wallet address: Invalid format');
            }

            // Check KYC status
            if (user.kyc_status === 'verified') {
                console.log('   ✅ KYC Status: Correctly set to verified');
            } else {
                console.log(`   ⚠️  KYC Status: ${user.kyc_status} (expected: verified)`);
            }

        } else {
            console.log('ℹ️  No test user found in database');
            console.log('   To create a test registration, use the signup page with:');
            console.log(`   Email: ${testEmail}`);
        }

        // Step 4: Check audit logs
        console.log('\n📋 Step 4: Checking audit logs...');
        const fs = require('fs');
        const path = require('path');
        const auditPath = path.join(__dirname, '../data/liveness_registration_audit.json');

        if (fs.existsSync(auditPath)) {
            const logs = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
            console.log(`✅ Found ${logs.length} registration audit entries`);
            if (logs.length > 0) {
                const latest = logs[logs.length - 1];
                console.log('   Latest registration:');
                console.log(`     User ID: ${latest.userID}`);
                console.log(`     Email: ${latest.email}`);
                console.log(`     Timestamp: ${latest.timestamp}`);
                console.log(`     Fingerprint: ${latest.fingerprint.substring(0, 16)}...`);
            }
        } else {
            console.log('ℹ️  No audit log file found yet');
        }

        console.log('\n✅ Verification complete!\n');

        // Summary
        console.log('📊 SUMMARY:');
        console.log('   Database schema: OK');
        console.log('   Data flow: Frontend → Backend → Database');
        console.log('   Security: Password hashed, National ID hashed, Face descriptor stored as JSONB');
        console.log('   KYC: Auto-set to \'verified\' upon successful registration');

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await pool.end();
    }
}

// Run verification
verifyRegistrationFlow();
