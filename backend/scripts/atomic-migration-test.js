const { execSync } = require('child_process');
require('dotenv').config();

async function runAtomic() {
    console.log('🌋 ATOMIC MIGRATION TEST START...');
    const url = process.env.DATABASE_URL;

    for (let i = 1; i <= 51; i++) {
        process.stdout.write(`   [${i}/51] Applying... `);
        try {
            const output = execSync('npx node-pg-migrate up 1', {
                env: { ...process.env, DATABASE_URL: url },
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout/stderr
            });
            console.log('✅ PASS');
        } catch (err) {
            console.log('❌ FAIL');
            console.error('\n🛑 ERROR LOG:');
            console.error(err.stdout.toString() || err.stderr.toString());
            process.exit(1);
        }
    }
    console.log('\n✅ ALL 51 MIGRATIONS APPLIED SUCCESSFULLY.');
}

runAtomic();
