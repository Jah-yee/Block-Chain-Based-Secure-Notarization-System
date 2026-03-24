/**
 * Direct Registration API Test
 * Tests the /users/register endpoint with sample data
 */

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

async function testRegistration() {
    console.log('🧪 Testing Registration Endpoint...\n');

    // Sample valid registration data
    const testData = {
        name: "Test User " + Date.now(),
        email: `test${Date.now()}@example.com`,
        password: "SecurePass123!",
        nationalId: "TEST-NID-" + Date.now(),
        walletAddress: "0x" + Math.random().toString(16).substring(2, 42).padEnd(40, '0'),
        faceDescriptor: Array(128).fill(0).map(() => Math.random() * 2 - 1) // Random 128-float array
    };

    console.log('Test Data:');
    console.log('  Name:', testData.name);
    console.log('  Email:', testData.email);
    console.log('  Wallet:', testData.walletAddress);
    console.log('  Face Descriptor:', testData.faceDescriptor.length, 'floats');
    console.log('  Password:', testData.password.length, 'chars');
    console.log('  National ID:', testData.nationalId);
    console.log('\nSending POST request to:', `${baseUrl}/users/register`);
    console.log('---\n');

    try {
        const response = await fetch(`${baseUrl}/users/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            data = responseText;
        }

        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('\n✅ SUCCESS! Registration completed.');
            console.log('User ID:', data.id);
            console.log('Check the backend terminal for detailed logs.');
        } else {
            console.log('\n❌ FAILED! Registration rejected.');
            console.log('Error:', data.error || data);
        }

    } catch (error) {
        console.error('\n❌ REQUEST FAILED!');
        console.error('Error:', error.message);
        console.error('\nPossible causes:');
        console.error('  - Backend server not running on port 5000');
        console.error('  - Network/firewall blocking the request');
        console.error('  - CORS configuration issue');
    }
}

testRegistration();
