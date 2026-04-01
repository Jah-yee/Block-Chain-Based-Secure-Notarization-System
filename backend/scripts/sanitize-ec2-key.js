const fs = require('fs');
const path = require('path');

/**
 * 🛠️ EC2 KEY SANITIZER
 * Fixes "invalid format" by forcing Unix LF line endings.
 */

const srcPath = 'C:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/bbsns-keys.pem';
const dstPath = path.join(__dirname, '..', 'tmp2', 'bbsns-keys.pem');

try {
    if (!fs.existsSync(path.dirname(dstPath))) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    }

    const raw = fs.readFileSync(srcPath, 'utf8');
    const clean = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() + '\n';
    
    fs.writeFileSync(dstPath, clean, { encoding: 'utf8' });
    console.log(`✅ Sanitized key written to: ${dstPath}`);
} catch (err) {
    console.error('❌ Sanitization failed:', err.message);
    process.exit(1);
}
