const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runTests() {
    const client = await pool.connect();
    console.log('--- STARTING ADVERSARIAL INTEGRITY AUDIT ---');

    try {
        // Prepare a test doc
        const setup = await client.query("SELECT id, file_hash FROM documents WHERE submission_state = 'pending' LIMIT 1");
        if (setup.rows.length === 0) {
            console.log('No pending docs to test with. Create one first.');
            process.exit(0);
        }
        const docId = setup.rows[0].id;
        const correctHash = setup.rows[0].file_hash;

        console.log(`\n--- TEST 1: Manual Confirmation without Proof ---`);
        try {
            await client.query("SET app.is_trusted_worker = 'true'");
            await client.query("UPDATE documents SET chain_confirmed = true WHERE id = $1", [docId]);
            console.log('❌ Failure: Trigger did not catch missing proof row.');
        } catch (err) {
            console.log('✅ Success: Trigger blocked update: ' + err.message);
        }

        console.log(`\n--- TEST 2: Unauthorized Worker Session ---`);
        try {
            await client.query("SET app.is_trusted_worker = 'false'");
            await client.query("UPDATE documents SET chain_confirmed = true WHERE id = $1", [docId]);
            console.log('❌ Failure: Role session gating did not block update.');
        } catch (err) {
            console.log('✅ Success: Gating blocked update: ' + err.message);
        }

        console.log(`\n--- TEST 3: Semantic Mismatch Proof Injection ---`);
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL app.is_trusted_worker = 'true'");
            // Inject a proof row for a FAKE hash
            await client.query(`
                INSERT INTO blockchain_receipts (doc_id, tx_hash, signer, doc_hash, contract_address)
                VALUES ($1, '0xfake-tx-hash', '0xsigner', '0xfake-file-hash', '0xcontract')
            `, [docId]);

            // Attempt to confirm the doc which has a DIFFERENT hash
            await client.query("UPDATE documents SET chain_confirmed = true, approval_tx_hash = '0xfake-tx-hash' WHERE id = $1", [docId]);
            await client.query("COMMIT");
            console.log('❌ Failure: Trigger allowed confirmation with semantic hash mismatch.');
        } catch (err) {
            await client.query("ROLLBACK");
            console.log('✅ Success: Trigger caught semantic mismatch: ' + err.message);
        }

        console.log(`\n--- TEST 4: Immutability Enforcement ---`);
        try {
            // Setup valid-looking confirmation (internal only for test)
            await client.query("BEGIN");
            await client.query("SET LOCAL app.is_trusted_worker = 'true'");
            await client.query(`
                INSERT INTO blockchain_receipts (doc_id, tx_hash, signer, doc_hash, contract_address)
                VALUES ($1, '0xvalid-tx', '0xsigner', $2, '0xcontract')
            `, [docId, correctHash]);
            await client.query("UPDATE documents SET chain_confirmed = true, approval_tx_hash = '0xvalid-tx' WHERE id = $1", [docId]);

            // Now attempt to change the file_hash
            await client.query("UPDATE documents SET file_hash = '0xtampered-hash' WHERE id = $1", [docId]);
            await client.query("COMMIT");
            console.log('❌ Failure: Immutability gate allowed changing file_hash of confirmed doc.');
        } catch (err) {
            await client.query("ROLLBACK");
            console.log('✅ Success: Immutability gate blocked change: ' + err.message);
        }

    } finally {
        console.log('\n--- ADVERSARIAL AUDIT COMPLETE ---');
        client.release();
        await pool.end();
    }
}

runTests();
