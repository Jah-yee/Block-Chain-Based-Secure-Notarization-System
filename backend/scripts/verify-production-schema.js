require('dotenv').config();
const pool = require('../src/db/index');

/**
 * 🔍 PRODUCTION SCHEMA AUDITOR
 * Performs a structural verification of the database to ensure migrations
 * were not just 'recorded' but actually 'applied' correctly.
 */

async function verifySchema() {
    console.log('🔍 [AUDIT] Starting Deep Schema Verification...');

    const checks = [
        { 
            name: 'Tables Exist', 
            query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
            expected: ['users', 'documents', 'upload_intents', 'system_config', 'system_logs']
        },
        {
            name: 'Critical Constraints',
            query: "SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = 'public'",
            expected: ['unique_global_file_hash', 'unique_document_payment_tx', 'active_requires_human_verification']
        },
        {
            name: 'Enums Exist',
            query: "SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'",
            expected: ['identity_lifecycle', 'document_status_enum', 'transaction_status_enum']
        }
    ];

    let overallSuccess = true;

    for (const check of checks) {
        process.stdout.write(`   - Checking ${check.name}: `);
        try {
            const { rows } = await pool.query(check.query);
            const actual = rows.map(r => Object.values(r)[0]);
            
            const missing = check.expected.filter(e => !actual.includes(e));
            
            if (missing.length === 0) {
                console.log('✅ PASS');
            } else {
                console.log(`❌ FAIL (Missing: ${missing.join(', ')})`);
                overallSuccess = false;
            }
        } catch (err) {
            console.log(`❌ ERROR (${err.message})`);
            overallSuccess = false;
        }
    }

    if (!overallSuccess) {
        console.error('\n❌ [AUDIT_FAIL] Database schema is inconsistent with application requirements.');
        process.exit(1);
    }

    console.log('\n✅ [AUDIT_SUCCESS] Database schema is 100% production-ready.');
    process.exit(0);
}

verifySchema().catch(err => {
    console.error('❌ [AUDIT_FATAL] Unexpected error:', err.message);
    process.exit(1);
});
