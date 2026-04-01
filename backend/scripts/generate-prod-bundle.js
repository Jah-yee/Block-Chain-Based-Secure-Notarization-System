const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 📦 PRODUCTION BUNDLE GENERATOR
 * Excludes: node_modules, tests, tmp, logs, .git, .env
 */

async function generate() {
    console.log('📦 [GENERATE] Creating Hardened Production Artifact...');
    const rootDir = path.join(__dirname, '..');
    const zipName = 'bbsns-backend-prod.zip';

    // Ensure directory existence
    const uploadsDir = path.join(rootDir, 'uploads');
    const logsDir = path.join(rootDir, 'logs');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

    try {
        // Use PowerShell Compress-Archive for native Windows ZIP
        // We'll stage it in a 'temp_prod' folder to control EXACT contents
        const stageDir = path.join(rootDir, 'temp_prod');
        if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
        fs.mkdirSync(stageDir);

        const includeList = [
            'src',
            'migrations',
            'scripts',
            'package.json',
            'package-lock.json',
            'server.js',
            'deploy.sh',
            'rollback.sh',
            'uploads', // empty
            'logs'     // empty
        ];

        includeList.forEach(item => {
            const src = path.join(rootDir, item);
            const dst = path.join(stageDir, item);
            if (fs.existsSync(src)) {
                execSync(`powershell -Command "Copy-Item -Path '${src}' -Destination '${stageDir}' -Recurse -Force"`);
            }
        });

        // Create the ZIP
        console.log(`   - Compressing to ${zipName}...`);
        execSync(`powershell -Command "Compress-Archive -Path '${stageDir}/*' -DestinationPath '${path.join(rootDir, zipName)}' -Force"`);
        
        // Cleanup
        fs.rmSync(stageDir, { recursive: true, force: true });

        console.log(`✅ [GENERATE_SUCCESS] Created: ${zipName}`);
    } catch (err) {
        console.error('❌ [GENERATE_FATAL] Failed:', err.message);
        process.exit(1);
    }
}

generate();
