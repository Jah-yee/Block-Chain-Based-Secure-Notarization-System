const fs = require('fs');
const path = require('path');

/**
 * 🧹 PEM SANITIZER
 * Fixes "invalid format" by forcing Unix LF and removing any character anomalies.
 */

const srcPath = 'C:\\Users\\Lenovo\\OneDrive\\Documents\\bbsns-keys.pem';
const dstPath = path.join(__dirname, '..', 'tmp', 'bbsns-keys.pem');

try {
    const rawContent = fs.readFileSync(srcPath, 'utf8');
    
    // 1. Remove all \r (normalize to LF)
    // 2. Trim every line
    // 3. Ensure a single trailing newline
    const sanitized = rawContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n') + '\n';

    if (!fs.existsSync(path.dirname(dstPath))) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    }

    fs.writeFileSync(dstPath, sanitized, { encoding: 'utf8' });
    console.log(`✅ Sanitized PEM written to: ${dstPath}`);
    console.log(`📏 Original Size: ${fs.statSync(srcPath).size} bytes`);
    console.log(`📏 Sanitized Size: ${fs.statSync(dstPath).size} bytes`);

} catch (err) {
    console.error('❌ Sanitization failed:', err.message);
    process.exit(1);
}
