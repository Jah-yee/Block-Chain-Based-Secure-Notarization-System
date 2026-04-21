const { Pool } = require('pg');
const DocumentStatusService = require('../src/services/document-status.service');

/**
 * 🛡️ STATE MACHINE STRESS TEST (BBSNS BUNKER V3.8)
 * Goal: Prove that the Kernel handles races and illegal transitions natively.
 * Strategy: Using a raw PG pool to bypass the Audit Sentinel for pure logic verification.
 */

async function runTests() {
    console.log('[TEST] Starting State Machine Stress Test...');
    
    // Raw pool to verify logic without Sentinel overhead
    const pool = new Pool({
        connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5432/notarydb'
    });

    console.log('[TEST] Connected to database.');

    // 1. Setup Test Document (Find a valid user first)
    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    if (userRes.rows.length === 0) throw new Error("No users found in DB to link test document.");
    const realUserId = userRes.rows[0].id;

    const setupRes = await pool.query(
        "INSERT INTO documents (user_id, file_hash, filename, submission_state, revision, storage_key) VALUES ($1, 'race-test-hash', 'race.pdf', 'pending', 0, 'test/race.pdf') RETURNING id",
        [realUserId]
    );
    const docId = setupRes.rows[0].id;
    console.log(`[TEST] Created test document ID: ${docId}`);

    try {
        // --- TEST 1: INVALID TRANSITION ---
        console.log('[TEST 1] Attempting illegal transition: pending -> confirmed...');
        try {
            const client = await pool.connect();
            try {
                await DocumentStatusService.updateStatus(client, docId, 'pending', 0, 'confirmed');
                console.error('[FAIL] Illegal transition allowed!');
            } finally {
                client.release();
            }
        } catch (err) {
            if (err.message.includes('INVALID_TRANSITION')) {
                console.log('[PASS] Illegal transition blocked correctly.');
            } else {
                throw err;
            }
        }

        // --- TEST 2: RACE CONDITION ---
        console.log('[TEST 2] Simulating Race Condition (Revision Conflict)...');
        
        // Both requests think state is pending and revision is 0
        const clientA = await pool.connect();
        const clientB = await pool.connect();

        try {
            // Request A tries to submit
            // Request B tries to reject
            // They run in "parallel" relative to the DB revision
            const reqA = DocumentStatusService.updateStatus(clientA, docId, 'pending', 0, 'submitted_to_blockchain');
            const reqB = DocumentStatusService.updateStatus(clientB, docId, 'pending', 0, 'rejected');

            const results = await Promise.allSettled([reqA, reqB]);
            
            const success = results.find(r => r.status === 'fulfilled' && r.value.success);
            const conflict = results.find(r => r.status === 'fulfilled' && r.value.error === 'STATE_CONFLICT');

            if (success && conflict) {
                console.log('[PASS] Race handled. 1 Success, 1 Conflict detected.');
                console.log(`[PASS] Conflict snapshot: State=${conflict.value.currentState}, Rev=${conflict.value.currentRevision}`);
            } else {
                console.error('[FAIL] Race handling failed.', { 
                    success: !!success, 
                    conflict: !!conflict,
                    results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
                });
            }
        } finally {
            clientA.release();
            clientB.release();
        }

    } finally {
        // Cleanup
        await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
        console.log('[TEST] Cleanup complete.');
        await pool.end();
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('[TEST_CRITICAL_ERROR]', err);
    process.exit(1);
});
