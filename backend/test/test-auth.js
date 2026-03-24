/**
 * End-to-End Test Authentication Script
 * Tests the complete test wallet authentication flow
 * 
 * Usage: node test-auth.js
 */

const API_URL = process.env.API_URL || 'http://localhost:5000';

// Test wallet from the pool
const TEST_WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
const TEST_SIGNATURE = '0xTEST_SIGNATURE_DEV_MODE_ONLY';

async function testAuthentication() {
    console.log('🧪 Testing Test Wallet Authentication Flow\n');
    console.log('═══════════════════════════════════════════\n');

    try {
        // Step 1: Verify endpoint
        console.log('📡 Step 1: Testing /auth/verify endpoint...');
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                wallet_address: TEST_WALLET,
                signature: TEST_SIGNATURE,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Authentication failed: ${error.error || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log('✅ Authentication successful!\n');

        // Step 2: Validate response
        console.log('🔍 Step 2: Validating response...');

        if (!data.token) {
            throw new Error('No token received');
        }
        console.log('✅ JWT token received');

        if (!data.testMode) {
            throw new Error('Test mode flag not set');
        }
        console.log('✅ Test mode flag confirmed');

        console.log('\n📊 Response Data:');
        console.log('─────────────────────────────────────────');
        console.log(`Token: ${data.token.substring(0, 20)}...`);
        console.log(`Test Mode: ${data.testMode}`);
        console.log(`Expires In: ${data.expires_in} seconds`);
        console.log(`Message: ${data.message || 'N/A'}`);

        // Step 3: Decode JWT (basic)
        console.log('\n🔐 Step 3: Decoding JWT...');
        const tokenParts = data.token.split('.');
        if (tokenParts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        console.log('✅ JWT decoded successfully');
        console.log('\n📋 JWT Payload:');
        console.log('─────────────────────────────────────────');
        console.log(`Wallet: ${payload.wallet_address}`);
        console.log(`Test Mode: ${payload.testMode}`);
        console.log(`Issued At: ${new Date(payload.iat * 1000).toISOString()}`);
        console.log(`Expires At: ${new Date(payload.exp * 1000).toISOString()}`);

        // Step 4: Test with invalid wallet
        console.log('\n🚫 Step 4: Testing invalid wallet rejection...');
        const invalidResponse = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                wallet_address: '0xINVALID_WALLET_NOT_IN_POOL',
                signature: TEST_SIGNATURE,
            }),
        });

        if (invalidResponse.ok) {
            throw new Error('Invalid wallet was accepted (security issue!)');
        }

        const invalidError = await invalidResponse.json();
        console.log('✅ Invalid wallet correctly rejected');
        console.log(`   Reason: ${invalidError.error}`);

        // Step 5: Test with invalid signature
        console.log('\n🚫 Step 5: Testing invalid signature rejection...');
        const invalidSigResponse = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                wallet_address: TEST_WALLET,
                signature: '0xINVALID_SIGNATURE',
            }),
        });

        if (invalidSigResponse.ok) {
            const invalidSigData = await invalidSigResponse.json();
            if (invalidSigData.testMode) {
                throw new Error('Invalid signature was accepted in test mode (security issue!)');
            }
        }
        console.log('✅ Invalid signature correctly rejected or handled');

        // Final summary
        console.log('\n═══════════════════════════════════════════');
        console.log('✅ ALL TESTS PASSED!');
        console.log('═══════════════════════════════════════════\n');
        console.log('Test Summary:');
        console.log('  ✓ Authentication endpoint working');
        console.log('  ✓ JWT token generation working');
        console.log('  ✓ Test mode flag set correctly');
        console.log('  ✓ Invalid wallet rejection working');
        console.log('  ✓ Security checks functioning\n');

        return true;
    } catch (error) {
        console.error('\n❌ TEST FAILED!');
        console.error('═══════════════════════════════════════════');
        console.error(`Error: ${error.message}`);
        console.error('\nStack trace:');
        console.error(error.stack);
        console.error('\n');
        return false;
    }
}

// Run tests
if (require.main === module) {
    console.log('🚀 Starting Test Wallet Authentication Tests\n');
    console.log('Configuration:');
    console.log(`  API URL: ${API_URL}`);
    console.log(`  Test Wallet: ${TEST_WALLET}`);
    console.log(`  Test Signature: ${TEST_SIGNATURE}\n`);

    testAuthentication()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = { testAuthentication };
