const http = require('http');
const fs = require('fs');

async function verify() {
    const token = fs.readFileSync('test_token.txt', 'utf8').trim();

    const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/documents',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        console.log(`Status Code: ${res.statusCode}`);
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log('Response Body:', data);
            process.exit(0);
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error);
        process.exit(1);
    });

    req.end();
}

verify();
