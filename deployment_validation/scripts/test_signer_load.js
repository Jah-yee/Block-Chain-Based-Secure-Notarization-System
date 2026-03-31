const { KMSSigner } = require('../src/blockchain/kms-signer');
const { ethers } = require('ethers');

console.log('--- KMSSigner Structural Test ---');
try {
    const signer = new KMSSigner('alias/test', new ethers.JsonRpcProvider('http://localhost:8545'));
    console.log('✅ KMSSigner instantiated');
    console.log('Address (cached):', signer.address);
    console.log('--- PASS ---');
} catch (err) {
    console.error('❌ KMSSigner failed to instantiate:', err);
    process.exit(1);
}
