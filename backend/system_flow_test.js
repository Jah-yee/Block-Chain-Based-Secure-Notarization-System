const axios = require('axios');
const { Pool } = require('pg');
const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const FormData = require('form-data');

const API_BASE = 'http://localhost:5000/api';
const pool = new Pool({
    connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
});

async function runTests() {
    const failures = [];
    let authToken = '';
    const testEmail = `user123@example.com`; // Stable for test
    const wallet = ethers.Wallet.createRandom();
    const walletAddress = wallet.address.toLowerCase();

    console.log(`🚀 Starting Full System Flow Test (Hardened Protocol)...`);
    console.log(`   - Test Wallet: ${walletAddress}`);

    // --- STEP 1: REGISTRATION ---
    try {
        console.log('\n--- 1. REGISTRATION ---');
        const testEmail = `flow_${Date.now()}@test.com`;
        const regRes = await axios.post(`${API_BASE}/users/register`, {
            username: `user_${Date.now()}`,
            name: 'Test flow User',
            email: testEmail,
            password: 'Password123!',
            walletAddress: walletAddress,
            nationalId: 'ID-FLOW-99'
        });
        console.log('✅ Registration: Pass');
        global.regEmail = testEmail;
    } catch (e) {
        // If user exists, ignore Error 409 but log others
        if (e.response?.status !== 409) {
            failures.push({ stage: 'Registration', error: e.message, data: e.response?.data });
        } else {
            console.log('ℹ️ Registration: User already exists (OK)');
            global.regEmail = testEmail; // Ensure it's set for Login
        }
    }

    // --- STEP 2: LOGIN (MFA/Web3) ---
    try {
        console.log('\n--- 2. LOGIN ---');
        // 1. Get Nonce
        const nonceRes = await axios.post(`${API_BASE}/auth/nonce`, {
            wallet_address: walletAddress,
            purpose: 'LOGIN'
        });
        const nonce = nonceRes.data.nonce;
        
        // 2. Sign Message
        const message = `Login request for BBSNS: ${nonce}`;
        const signature = await wallet.signMessage(message);

        // 3. Verify / Login
        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            email: global.regEmail,
            password: 'Password123!',
            walletAddress: walletAddress,
            signature: signature,
            nationalId: 'ID-FLOW-99',
            signature_nonce: nonce
        });
        
        authToken = loginRes.data.token || loginRes.data.accessToken;
        if (!authToken) throw new Error('No token returned');
        console.log('✅ Login: Pass');
    } catch (e) {
        failures.push({ stage: 'Login', error: e.message, data: e.response?.data });
    }

    // --- STEP 3: DOCUMENT INITIATE ---
    try {
        console.log('\n--- 3. DOCUMENT INITIATE ---');
        const form = new FormData();
        form.append('file', Buffer.from('Test Content'), 'test.txt');
        form.append('filename', 'test_flow.txt');

        const initRes = await axios.post(`${API_BASE}/documents/initiate`, form, {
            headers: { 
                ...form.getHeaders(),
                Authorization: `Bearer ${authToken}` 
            }
        });
        
        if (initRes.status !== 201) throw new Error(`Status ${initRes.status}`);
        console.log('✅ Document Initiate: Pass');
        console.log(`   - Intent ID: ${initRes.data.intent_id}`);
    } catch (e) {
        failures.push({ stage: 'DocumentInitiate', error: e.message, data: e.response?.data });
    }

    // --- STEP 4: FETCH DOCUMENTS ---
    try {
        console.log('\n--- 4. FETCH DOCUMENTS ---');
        const docsRes = await axios.get(`${API_BASE}/documents`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('✅ Fetch Documents: Pass (Count: ' + docsRes.data.length + ')');
    } catch (e) {
        failures.push({ stage: 'FetchDocuments', error: e.message, data: e.response?.data });
    }

    // --- STEP 5: NOTARY APPLY ---
    try {
        console.log('\n--- 5. NOTARY APPLY ---');
        const applyRes = await axios.post(`${API_BASE}/notaries/applications/public`, {
            fullName: 'Flow Notary Applicant',
            email: `notary_flow_${Date.now()}@test.com`,
            password: 'Password123!',
            walletAddress: ethers.Wallet.createRandom().address,
            phone: '1234567890',
            license: 'FLOW-LIC-001',
            experience: 'Test Exp',
            nationalId: 'FLOW-ID-NOTARY',
            nationality: 'Flowland'
        });
        console.log('✅ Notary Apply: Pass');
    } catch (e) {
        failures.push({ stage: 'NotaryApply', error: e.message, data: e.response?.data });
    }

    // FINAL REPORT
    console.log('\n--- FINAL TEST RESULTS ---');
    if (failures.length === 0) {
        console.log('🎊 ALL TESTS PASSED SUCCESSFULLY! 🎊');
    } else {
        console.log('❌ FAILURES DETECTED:');
        console.log(JSON.stringify(failures, null, 2));
    }

    await pool.end();
}

runTests().catch(err => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
