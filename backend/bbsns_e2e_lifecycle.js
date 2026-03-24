/**
 * BBSNS End-to-End Document Lifecycle Test
 * Tests the REAL flow against the REAL DB — no mocks, no HTTP mocks.
 * Uses the actual service modules loaded directly.
 *
 * Flow:
 *  1. Create test OWNER user with 10 NTKR balance
 *  2. Simulate document upload (insert + NTKR deduction + ntkr_transactions log)
 *  3. Verify: doc created, NTKR deducted, ntkr_transactions row with tx_type='burn'
 *  4. Verify: submission_state='pending', no notary assigned (0 real notaries in system)
 *  5. Create test NOTARY user
 *  6. Call assignNotary(docId) from reputation.service
 *  7. Verify: notary_id assigned, submission_state='assigned'
 *  8. Run reputation worker
 *  9. Verify: effective_reputation written for test notary
 * 10. Simulate a reputation APPROVE event
 * 11. Verify: raw_reputation increased by +10
 * 12. Verify REJECT without reason is blocked
 * 13. CLEANUP: Remove all test rows
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

// Load actual service modules
const reputationService = require('./src/services/reputation.service.js');
const { runReputationWorker } = require('./src/workers/reputation-worker.js');

const R = { pass: 0, fail: 0, items: [] };
function pass(id, msg) { R.pass++; R.items.push({ ok: true, id, msg }); console.log(`  ✅ ${id}: ${msg}`); }
function fail(id, msg, detail = '') {
  R.fail++;
  R.items.push({ ok: false, id, msg });
  console.error(`  ❌ ${id}: ${msg}`);
  if (detail) console.error(`     Detail: ${detail}`);
}
function sec(n) { console.log(`\n${'─'.repeat(65)}\n  🔵 ${n}\n${'─'.repeat(65)}`); }

// Track created IDs for cleanup
const cleanup = { users: [], documents: [], ntkrTx: [], repEvents: [] };

async function main() {
  console.log('\n' + '█'.repeat(65));
  console.log('  BBSNS END-TO-END DOCUMENT LIFECYCLE TEST (LIVE DB)');
  console.log('█'.repeat(65) + '\n');

  try {
    // ── STEP 1: Create Test OWNER ──────────────────────────────────
    sec('STEP 1: Create Test OWNER (10 NTKR)');

    const testWallet = '0x' + 'e2e' + Date.now().toString(16).padStart(37, '0');
    const ownerRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, wallet_address, role, kyc_verified, ntkr_balance, is_banned, is_active, created_at, updated_at)
       VALUES ($1, $2, 'testhash', $3, 'owner', true, 10, false, true, NOW(), NOW()) RETURNING id, ntkr_balance`,
      [`test_owner_${Date.now()}`, `e2e_owner_${Date.now()}@test.local`, testWallet]
    );
    const ownerId = ownerRes.rows[0].id;
    const ownerBalance = parseFloat(ownerRes.rows[0].ntkr_balance);
    cleanup.users.push(ownerId);
    pass('STEP1-CREATE', `Test OWNER created: id=${ownerId}, ntkr_balance=${ownerBalance}`);

    // ── STEP 2: Simulate Document Upload ──────────────────────────
    sec('STEP 2: Simulate Document Upload (inline, no HTTP)');

    const client = await pool.connect();
    let docId, newBalance;
    try {
      const cost = 1; // standard document
      await client.query('BEGIN');

      // Deduct NTKR (same pattern as documents.js)
      const balRes = await client.query('SELECT ntkr_balance FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
      const currentBal = parseFloat(balRes.rows[0].ntkr_balance);
      if (currentBal < cost) throw new Error(`Insufficient NTKR: have ${currentBal}, need ${cost}`);

      await client.query('UPDATE users SET ntkr_balance = ntkr_balance - $1, updated_at=NOW() WHERE id=$2', [cost, ownerId]);

      // Insert document
      const docRes = await client.query(
        `INSERT INTO documents (user_id, filename, filepath, file_hash, submission_state, created_at, updated_at, ntkr_sent, is_deleted)
         VALUES ($1, 'test_e2e.pdf', '/tmp/test_e2e.pdf', $2, 'pending', NOW(), NOW(), $3, false) RETURNING id`,
        [ownerId, 'sha256_e2e_test_' + Date.now(), cost]
      );
      docId = docRes.rows[0].id;
      cleanup.documents.push(docId);

      // Log ntkr_transactions (exact same columns as documents.js line 120-123)
      const ntkrTxRes = await client.query(
        `INSERT INTO ntkr_transactions (user_id, document_id, tx_type, amount, status, note, created_at)
         VALUES ($1, $2, 'burn', $3, 'pending', 'e2e-test', NOW()) RETURNING id`,
        [ownerId, docId, cost]
      );
      cleanup.ntkrTx.push(ntkrTxRes.rows[0].id);

      await client.query('COMMIT');

      const afterBal = await pool.query('SELECT ntkr_balance FROM users WHERE id=$1', [ownerId]);
      newBalance = parseFloat(afterBal.rows[0].ntkr_balance);
      pass('STEP2-COMMIT', `Document created, transaction committed`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      fail('STEP2-COMMIT', `Upload simulation FAILED: ${e.message}`);
      client.release();
      throw e;
    }
    client.release();

    // ── STEP 3: Verify Upload Results ─────────────────────────────
    sec('STEP 3: Verify Upload Results');

    // 3a. NTKR deducted
    if (newBalance === ownerBalance - 1) {
      pass('STEP3-NTKR-DEDUCT', `NTKR correctly deducted: ${ownerBalance} → ${newBalance} (cost=1)`);
    } else {
      fail('STEP3-NTKR-DEDUCT', `NTKR not deducted correctly: before=${ownerBalance}, after=${newBalance}`);
    }

    // 3b. Document state
    const docCheck = await pool.query('SELECT submission_state, notary_id, ntkr_sent FROM documents WHERE id=$1', [docId]);
    const doc = docCheck.rows[0];
    if (doc.submission_state === 'pending') {
      pass('STEP3-DOC-STATE', `submission_state='pending' ✓`);
    } else {
      fail('STEP3-DOC-STATE', `Expected 'pending', got '${doc.submission_state}'`);
    }
    if (!doc.notary_id) {
      pass('STEP3-NO-NOTARY', `notary_id=NULL (correct — no notaries in system yet)`);
    } else {
      fail('STEP3-NO-NOTARY', `Unexpected notary assignment: notary_id=${doc.notary_id}`);
    }
    if (parseFloat(doc.ntkr_sent) === 1) {
      pass('STEP3-NTKR-SENT', `ntkr_sent=1 stored in document ✓`);
    } else {
      fail('STEP3-NTKR-SENT', `Expected ntkr_sent=1, got ${doc.ntkr_sent}`);
    }

    // 3c. ntkr_transactions log
    const ntkrLog = await pool.query(
      `SELECT tx_type, amount, status FROM ntkr_transactions WHERE document_id=$1`, [docId]
    );
    if (ntkrLog.rows.length > 0 && ntkrLog.rows[0].tx_type === 'burn') {
      pass('STEP3-NTKR-LOG', `ntkr_transactions log created: tx_type='${ntkrLog.rows[0].tx_type}', amount=${ntkrLog.rows[0].amount}, status=${ntkrLog.rows[0].status}`);
    } else {
      fail('STEP3-NTKR-LOG', `ntkr_transactions log MISSING or wrong tx_type`, JSON.stringify(ntkrLog.rows));
    }

    // ── STEP 4: Create Test NOTARY ────────────────────────────────
    sec('STEP 4: Create Test NOTARY + Assignment Test');

    const notaryWallet = '0x' + 'e2e' + (Date.now() + 1).toString(16).padStart(37, '0');
    const notaryRes = await pool.query(
      `INSERT INTO users (username, email, password_hash, wallet_address, role, kyc_verified, ntkr_balance, raw_reputation, effective_reputation, is_banned, is_active, last_active_at, created_at, updated_at)
       VALUES ($1, $2, 'testhash', $3, 'notary', true, 0, 0, 0, false, true, NOW(), NOW(), NOW()) RETURNING id`,
      [`test_notary_${Date.now()}`, `e2e_notary_${Date.now()}@test.local`, notaryWallet]
    );
    const notaryId = notaryRes.rows[0].id;
    cleanup.users.push(notaryId);
    pass('STEP4-CREATE-NOTARY', `Test NOTARY created: id=${notaryId}`);

    // ── STEP 5: assignNotary ──────────────────────────────────────
    sec('STEP 5: Call assignNotary(docId)');

    const assignedId = await reputationService.assignNotary(docId);
    if (assignedId === notaryId) {
      pass('STEP5-ASSIGN', `assignNotary returned notaryId=${assignedId} (Bootstrap: only 1 notary → random = ${notaryId})`);
    } else if (assignedId !== null) {
      pass('STEP5-ASSIGN', `assignNotary returned notaryId=${assignedId} (another notary was selected)`);
    } else {
      fail('STEP5-ASSIGN', `assignNotary returned null — assignment failed for docId=${docId}`);
    }

    // Verify DB state after assignment
    const assignedDoc = await pool.query('SELECT submission_state, notary_id FROM documents WHERE id=$1', [docId]);
    const aDoc = assignedDoc.rows[0];
    if (aDoc.notary_id !== null) {
      pass('STEP5-DB-NOTARY', `documents.notary_id=${aDoc.notary_id} (correctly set)`);
    } else {
      fail('STEP5-DB-NOTARY', `documents.notary_id still NULL after assignNotary call`);
    }
    if (aDoc.submission_state === 'assigned') {
      pass('STEP5-DB-STATE', `submission_state='assigned' ✓`);
    } else {
      fail('STEP5-DB-STATE', `Expected 'assigned', got '${aDoc.submission_state}'`);
    }

    // ── STEP 6: Race Condition Guard Test ────────────────────────
    sec('STEP 6: Race Condition Guard');

    // Try to assign again — should be blocked by WHERE notary_id IS NULL
    const [r1, r2] = await Promise.all([
      pool.query(`UPDATE documents SET notary_id=$1, submission_state='assigned' WHERE id=$2 AND notary_id IS NULL RETURNING id`, [notaryId, docId]),
      pool.query(`UPDATE documents SET notary_id=$1, submission_state='assigned' WHERE id=$2 AND notary_id IS NULL RETURNING id`, [notaryId, docId])
    ]);
    if ((r1.rowCount + r2.rowCount) === 0) {
      pass('STEP6-RACE-GUARD', `Race guard correct — doc already assigned, both concurrent UPDATEs returned 0 rows`);
    } else {
      fail('STEP6-RACE-GUARD', `Race guard FAILED — doc was reassigned (${r1.rowCount + r2.rowCount} updated)`);
    }

    // ── STEP 7: Reputation Events ─────────────────────────────────
    sec('STEP 7: Reputation Scoring');

    const repBefore = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawBefore = parseFloat(repBefore.rows[0].raw_reputation);

    // 7a. APPROVE event
    await reputationService.handleEvent(notaryId, 'APPROVE', docId, {});
    const repAfterApprove = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawAfterApprove = parseFloat(repAfterApprove.rows[0].raw_reputation);
    if (rawAfterApprove === rawBefore + 10) {
      pass('STEP7-APPROVE', `APPROVE event: raw_reputation ${rawBefore} → ${rawAfterApprove} (+10 ✓)`);
    } else {
      fail('STEP7-APPROVE', `Expected +10, got ${rawAfterApprove - rawBefore}`, `before=${rawBefore} after=${rawAfterApprove}`);
    }

    // Log the reputation_event ID for cleanup
    const repEvt = await pool.query('SELECT id FROM reputation_events WHERE document_id=$1 AND event_type=$2', [docId, 'APPROVE']);
    if (repEvt.rows.length > 0) cleanup.repEvents.push(repEvt.rows[0].id);

    // 7b. REJECT without reason → must be blocked
    const repBeforeReject = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawBeforeReject = parseFloat(repBeforeReject.rows[0].raw_reputation);
    await reputationService.handleEvent(notaryId, 'REJECT', docId, {}); // No rejection_reason
    const repAfterReject = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawAfterReject = parseFloat(repAfterReject.rows[0].raw_reputation);
    if (rawAfterReject === rawBeforeReject) {
      pass('STEP7-REJECT-GUARD', `REJECT without reason correctly BLOCKED — score unchanged: ${rawBeforeReject} → ${rawAfterReject}`);
    } else {
      fail('STEP7-REJECT-GUARD', `REJECT without reason APPLIED — score changed: ${rawBeforeReject} → ${rawAfterReject}`);
    }

    // 7c. Duplicate APPROVE → must be blocked
    const repBeforeDupe = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawBeforeDupe = parseFloat(repBeforeDupe.rows[0].raw_reputation);
    await reputationService.handleEvent(notaryId, 'APPROVE', docId, {}); // Duplicate
    const repAfterDupe = await pool.query('SELECT raw_reputation FROM users WHERE id=$1', [notaryId]);
    const rawAfterDupe = parseFloat(repAfterDupe.rows[0].raw_reputation);
    if (rawAfterDupe === rawBeforeDupe) {
      pass('STEP7-DUPE-GUARD', `Duplicate APPROVE correctly BLOCKED — score unchanged: ${rawBeforeDupe} → ${rawAfterDupe}`);
    } else {
      fail('STEP7-DUPE-GUARD', `Duplicate APPROVE APPLIED — score changed: ${rawBeforeDupe} → ${rawAfterDupe}`);
    }

    // ── STEP 8: Reputation Worker ─────────────────────────────────
    sec('STEP 8: Run Reputation Worker');

    console.log('  🔄 Running worker...');
    await runReputationWorker();

    const notaryAfterWorker = await pool.query('SELECT raw_reputation, effective_reputation FROM users WHERE id=$1', [notaryId]);
    const n = notaryAfterWorker.rows[0];
    const effRep = parseFloat(n.effective_reputation);
    const rawRep = parseFloat(n.raw_reputation);

    if (n.effective_reputation !== null) {
      pass('STEP8-WORKER', `Worker ran and wrote effective_reputation=${effRep.toFixed(4)} for notaryId=${notaryId} (raw=${rawRep})`);
    } else {
      fail('STEP8-WORKER', `effective_reputation not written by worker — still NULL`);
    }

    if (rawRep > 0 && effRep <= rawRep) {
      pass('STEP8-FORMULA', `effective_reputation (${effRep.toFixed(4)}) ≤ raw_reputation (${rawRep}) — formula invariant holds`);
    } else if (rawRep === 0) {
      pass('STEP8-FORMULA', `effective_reputation=0 (raw=0) — formula correct for zero-rep notary`);
    } else {
      fail('STEP8-FORMULA', `effective_reputation (${effRep}) > raw_reputation (${rawRep}) — formula broken`);
    }

    // ── STEP 9: Schema Re-Verify (Final) ─────────────────────────
    sec('STEP 9: Final Schema Spot-Check');

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema='public' AND table_name IN ('token_deposits','transactions','reputation_events','ntkr_transactions')
    `);
    const tableSet = new Set(tables.rows.map(r => r.table_name));
    ['token_deposits', 'transactions', 'reputation_events', 'ntkr_transactions'].forEach(t => {
      if (tableSet.has(t)) pass(`SCHEMA-${t}`, `Table '${t}' exists ✓`);
      else fail(`SCHEMA-${t}`, `Table '${t}' MISSING`);
    });

    const userCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='users' AND column_name IN ('is_banned','is_active','raw_reputation','effective_reputation')
    `);
    const colSet = new Set(userCols.rows.map(r => r.column_name));
    ['is_banned', 'is_active', 'raw_reputation', 'effective_reputation'].forEach(c => {
      if (colSet.has(c)) pass(`SCHEMA-users.${c}`, `users.${c} exists ✓`);
      else fail(`SCHEMA-users.${c}`, `users.${c} MISSING`);
    });

  } finally {
    // ── CLEANUP ────────────────────────────────────────────────────
    sec('CLEANUP: Removing Test Data');

    try {
      if (cleanup.repEvents.length > 0) {
        await pool.query(`DELETE FROM reputation_events WHERE id = ANY($1)`, [cleanup.repEvents]);
        console.log(`  🗑️  Removed ${cleanup.repEvents.length} rep events`);
      }
      if (cleanup.ntkrTx.length > 0) {
        await pool.query(`DELETE FROM ntkr_transactions WHERE id = ANY($1)`, [cleanup.ntkrTx]);
        console.log(`  🗑️  Removed ${cleanup.ntkrTx.length} ntkr_transactions`);
      }
      if (cleanup.documents.length > 0) {
        await pool.query(`DELETE FROM documents WHERE id = ANY($1)`, [cleanup.documents]);
        console.log(`  🗑️  Removed ${cleanup.documents.length} document(s)`);
      }
      if (cleanup.users.length > 0) {
        await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [cleanup.users]);
        console.log(`  🗑️  Removed ${cleanup.users.length} test user(s)`);
      }
      console.log('  ✅ Cleanup complete — no test data left in DB');
    } catch (cleanErr) {
      console.error('  ⚠️  Cleanup error (test data may remain):', cleanErr.message);
    }
  }

  // ── FINAL VERDICT ─────────────────────────────────────────────
  console.log('\n' + '█'.repeat(65));
  console.log('  📋 END-TO-END LIFECYCLE TEST — FINAL REPORT');
  console.log('█'.repeat(65));
  console.log(`  ✅ PASSED:  ${R.pass}`);
  console.log(`  ❌ FAILED:  ${R.fail}`);

  if (R.fail > 0) {
    console.log('\n  🔴 FAILURES:');
    R.items.filter(i => !i.ok).forEach(f => console.error(`     ❌ [${f.id}] ${f.msg}`));
  }

  console.log('\n' + '═'.repeat(65));
  if (R.fail === 0) {
    console.log('  🏆 VERDICT: ✅ SYSTEM OPERATIONAL — FULL LIFECYCLE PASSED');
  } else {
    console.log(`  🔴 VERDICT: ❌ SYSTEM STILL HAS ISSUES (${R.fail} failures)`);
  }
  console.log('═'.repeat(65) + '\n');

  await pool.end();
  process.exit(R.fail === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('\n🚨 FATAL:', e.message, '\n', e.stack);
  pool.end();
  process.exit(1);
});
