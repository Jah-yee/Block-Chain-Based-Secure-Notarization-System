const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../migrations');
const files = fs.readdirSync(dir);

console.log('🔍 SEARCHING FOR CONFLICTING SQL SNIPPET...');

files.forEach(file => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes('ntkr_amount') && content.includes('VARCHAR(42)')) {
        console.log(`✅ FOUND CONFLICT IN: ${file}`);
        console.log('----------------------------');
        // Print the surrounding lines
        const lines = content.split('\n');
        lines.forEach(line => {
            if (line.includes('ntkr_amount')) console.log(`   ${line.trim()}`);
        });
    }
});
