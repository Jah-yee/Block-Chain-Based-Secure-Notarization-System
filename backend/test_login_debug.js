const axios = require('axios');
const { ethers } = require('ethers');

async function debugLogin() {
    const API_BASE = 'http://localhost:5000/api';
    const randomHex = require('crypto').randomBytes(32).toString('hex');
    const wallet = new ethers.Wallet('0x' + randomHex); 
    const address = wallet.address;

    try {
        console.log('1. REGISTRATION');
        const email = `debug_${Date.now()}@test.com`;
        await axios.post(`${API_BASE}/users/register`, {
            fullName: 'Debug User',
            email: email,
            walletAddress: address,
            password: 'Password123!',
            nationalId: 'DEBUG-ID'
        });
        console.log('✅ Registration Pass');

        console.log('2. NONCE');
        const nonceRes = await axios.post(`${API_BASE}/auth/nonce`, {
            wallet_address: address,
            purpose: 'LOGIN'
        });
        const nonce = nonceRes.data.nonce;
        console.log('✅ Nonce Pass:', nonce);

        console.log('3. LOGIN');
        const message = `Login request for BBSNS: ${nonce}`;
        const signature = await wallet.signMessage(message);

        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            email: email,
            password: 'Password123!',
            walletAddress: address,
            signature: signature,
            nationalId: 'DEBUG-ID',
            signature_nonce: nonce
        });
        console.log('✅ Login Pass');

    } catch (e) {
        console.error('❌ ERROR:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

debugLogin();
