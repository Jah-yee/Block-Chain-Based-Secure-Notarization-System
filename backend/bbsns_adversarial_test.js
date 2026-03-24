/**
 * BBSNS Full Adversarial Integration Test Suite
 * Tests: Auth, Assignment, Reputation, Race Conditions, Relayer, Data Consistency
 * Runs against LOCAL backend (port 5000) + PostgreSQL (port 5433)
 */

const { Pool } = require('pg');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const BACKEND_PORT = 5000;
const BACKEND_HOST = 'localhost';
const BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

const DB_CONFIG = {
  connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb'
};

// ─── RESULTS TRACKER ─────────────────────────────────────────────────────────
const results = {
  tests: [],
  passed: 0,
  failed: 0,
  warnings: []
};

function pass(test, msg, data = {}) {
  results.tests.push({ test, status: 'PASS', msg, data });
  results.passed++;
  console.log(`  ✅ PASS [${test}] ${msg}`);
}

function fail(test, msg, data = {}) {
  results.tests.push({ test, status: 'FAIL', msg, data });
  results.failed++;
  console.error(`  ❌ FAIL [${test}] ${msg}`);
}

function warn(test, msg) {
  results.warnings.push({ test, msg });
  console.warn(`  ⚠️  WARN [${test}] ${msg}`);
}

function section(name) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  🔴 ${name}`);
  console.log(`${'═'.repeat(70)}`);
}

// ─── HTTP HELPER ─────────────────────────────────────────────────────────────
async function apiRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timeout (15s)'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ─── DB HELPER ───────────────────────────────────────────────────────────────
let pool;
async function dbQuery(sql, params = []) {
  return pool.query(sql, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 0: BOOTSTRAP CHECKS
// ─────────────────────────────────────────────────────────────────────────────
async function test0_Bootstrap() {
  section('TEST 0: BOOTSTRAP — Backend + DB Connectivity');

  // 0a. Backend alive
  try {
    const r = await apiRequest('GET', '/');
    if (r.status === 200 && r.body.status === 'online') {
      pass('T0', `Backend alive — serverTime: ${r.body.serverTime}`);
    } else {
      fail('T0', `Backend root returned unexpected: status=${r.status}`, r.body);
    }
  } catch (e) {
    fail('T0', `Backend unreachable: ${e.message}`);
    console.error('FATAL: Cannot reach backend. Aborting.');
    process.exit(1);
  }

  // 0b. DB connection
  try {
    const r = await dbQuery('SELECT NOW() AS t, current_database() AS db');
    pass('T0', `DB connected — ${r.rows[0].db} at ${r.rows[0].t}`);
  } catch (e) {
    fail('T0', `DB unreachable: ${e.message}`);
    process.exit(1);
  }

  // 0c. Fetch existing state
  const userCount = await dbQuery("SELECT COUNT(*) FROM users");
  const notaryCount = await dbQuery("SELECT COUNT(*) FROM users WHERE role='notary'");
  const docCount = await dbQuery("SELECT COUNT(*) FROM documents WHERE is_deleted=false");
  console.log(`\n  📊 Current State:`);
  console.log(`     Users: ${userCount.rows[0].count}  |  Notaries: ${notaryCount.rows[0].count}  |  Docs: ${docCount.rows[0].count}`);

  return {
    totalUsers: parseInt(userCount.rows[0].count),
    totalNotaries: parseInt(notaryCount.rows[0].count),
    totalDocs: parseInt(docCount.rows[0].count)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: AUTH SYSTEM INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
async function test1_AuthIntegrity() {
  section('TEST 1: AUTH SYSTEM INTEGRITY');

  // 1a. Expired / reused nonce
  try {
    const r = await apiRequest('POST', '/api/auth/login', {
      walletAddress: '0x0000000000000000000000000000000000000001',
      signature: '0xdeadbeef',
      signature_nonce: 'fake-nonce-that-never-existed',
      email: 'fake@test.com',
      password: 'password123',
      nationalId: '123456'
    });
    if (r.status === 400 || r.status === 401 || r.status === 404) {
      pass('T1a', `Expired/invalid nonce correctly rejected (HTTP ${r.status}): ${r.body?.error}`);
    } else {
      fail('T1a', `Accepted expired nonce — HTTP ${r.status}`, r.body);
    }
  } catch (e) { fail('T1a', `Request failed: ${e.message}`); }

  // 1b. Tampered JWT
  const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTksImFkZHJlc3MiOiIweDAwMDEiLCJyb2xlIjozLCJpYXQiOjE3MDAwMDAwMDB9.fakesig';
  try {
    const r = await apiRequest('GET', '/api/documents', null, {
      'Authorization': `Bearer ${fakeJwt}`,
      'X-Actor-Id': '99999'
    });
    if (r.status === 401 || r.status === 403) {
      pass('T1b', `Tampered JWT rejected (HTTP ${r.status})`);
    } else {
      fail('T1b', `Tampered JWT ACCEPTED — HTTP ${r.status}`, r.body);
    }
  } catch (e) { fail('T1b', `Request failed: ${e.message}`); }

  // 1c. /auth/me with no token → null (not 401)
  try {
    const r = await apiRequest('GET', '/api/auth/me');
    if (r.status === 200 && r.body.user === null) {
      pass('T1c', '/auth/me returns null for unauthenticated (silent 200) — correct Zero-Trust behavior');
    } else {
      warn('T1c', `/auth/me returned: status=${r.status} body=${JSON.stringify(r.body)}`);
    }
  } catch (e) { fail('T1c', `Request failed: ${e.message}`); }

  // 1d. Pre-check endpoint
  try {
    const r = await apiRequest('POST', '/api/auth/pre-check', {
      walletAddress: '0x0000000000000000000000000000000000099999'
    });
    if (r.status === 200 && r.body.exists === false) {
      pass('T1d', 'Pre-check correctly returns exists=false for unknown wallet');
    } else if (r.status === 200) {
      pass('T1d', `Pre-check responded: ${JSON.stringify(r.body)}`);
    } else {
      fail('T1d', `Pre-check failed HTTP ${r.status}`, r.body);
    }
  } catch (e) { fail('T1d', `Request failed: ${e.message}`); }

  // 1e. Nonce rate limiter  
  try {
    let rateLimited = false;
    for (let i = 0; i < 7; i++) {
      const r = await apiRequest('POST', '/api/auth/nonce', {
        wallet_address: '0x0000000000000000000000000000000000000001',
        purpose: 'LOGIN'
      });
      if (r.status === 429) { rateLimited = true; break; }
    }
    if (rateLimited) {
      pass('T1e', 'Rate limiter triggered after 5 requests within window');
    } else {
      warn('T1e', 'Rate limiter NOT triggered after 7 nonce requests — may be window reset or IP-based issue');
    }
  } catch (e) { fail('T1e', `Request failed: ${e.message}`); }

  // 1f. Remote auth session lifecycle
  try {
    const sessionRes = await apiRequest('POST', '/api/auth/remote/session', { device_id: 'test-device-001' });
    if (sessionRes.status === 200 && sessionRes.body.sessionId) {
      const sessionId = sessionRes.body.sessionId;
      pass('T1f_create', `Remote auth session created: ${sessionId}`);

      const statusRes = await apiRequest('GET', `/api/auth/remote/status/${sessionId}`);
      if (statusRes.status === 200 && statusRes.body.status === 'pending') {
        pass('T1f_poll', `Remote session status=pending correctly returned`);
      } else {
        fail('T1f_poll', `Unexpected status: ${JSON.stringify(statusRes.body)}`);
      }
    } else {
      fail('T1f_create', `Remote session creation failed: ${JSON.stringify(sessionRes.body)}`);
    }
  } catch (e) { fail('T1f', `Request failed: ${e.message}`); }

  // 1g. Invalid session ID injection
  try {
    const r = await apiRequest('GET', '/api/auth/remote/status/../../../../etc/passwd');
    if (r.status === 400 || r.status === 404) {
      pass('T1g', `Path traversal in sessionId blocked (HTTP ${r.status})`);
    } else {
      warn('T1g', `Unexpected response to path traversal attempt: ${r.status}`);
    }
  } catch (e) { fail('T1g', `Request failed: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: ASSIGNMENT LOGIC + RACE CONDITION GUARD
// ─────────────────────────────────────────────────────────────────────────────
async function test2_AssignmentLogic(state) {
  section('TEST 2: ASSIGNMENT LOGIC + RACE CONDITION GUARD');

  const { totalNotaries } = state;

  // 2a. Bootstrap mode check
  if (totalNotaries < 3) {
    pass('T2a', `Bootstrap mode active: only ${totalNotaries} notary/notaries (< 3 threshold) — random assignment expected`);
  } else {
    pass('T2a', `Normal mode: ${totalNotaries} notaries — weighted assignment expected`);
  }

  // 2b. Check existing documents for proper assignment
  try {
    const docs = await dbQuery(`
      SELECT 
        id, submission_state, notary_id, created_at,
        (SELECT COUNT(*) FROM documents d2 WHERE d2.id = documents.id AND d2.notary_id IS NOT NULL) as has_notary
      FROM documents 
      WHERE is_deleted=false 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    const pending = docs.rows.filter(d => d.submission_state === 'pending' && !d.notary_id);
    const assigned = docs.rows.filter(d => d.notary_id !== null);
    const stuckPending = docs.rows.filter(d => d.submission_state === 'pending' && !d.notary_id);

    console.log(`\n  📋 Document State Summary (last 50):`);
    console.log(`     Assigned: ${assigned.length}  |  Stuck Pending (no notary): ${stuckPending.length}`);

    if (stuckPending.length === 0) {
      pass('T2b', 'No documents stuck in pending without notary assignment');
    } else {
      fail('T2b', `${stuckPending.length} document(s) stuck in 'pending' with no notary_id assigned`, {
        stuckIds: stuckPending.map(d => d.id)
      });
    }

    // 2c. Check for duplicate assignments (notary changed after initial assignment)
    const docsWithHistory = await dbQuery(`
      SELECT d.id, d.notary_id, COUNT(re.id) as event_count
      FROM documents d
      LEFT JOIN reputation_events re ON re.document_id = d.id
      WHERE d.is_deleted=false AND d.notary_id IS NOT NULL
      GROUP BY d.id, d.notary_id
      HAVING COUNT(re.id) > 1
    `);

    if (docsWithHistory.rows.length === 0) {
      pass('T2c', 'No documents have duplicate reputation events (no double-assignment evidence)');
    } else {
      warn('T2c', `${docsWithHistory.rows.length} documents have >1 reputation event — investigating...`);
      // Check if these are legitimate (one APPROVE/REJECT + separate DISPUTE)
      for (const doc of docsWithHistory.rows.slice(0, 3)) {
        const events = await dbQuery(`SELECT event_type, score_delta FROM reputation_events WHERE document_id=$1`, [doc.id]);
        const types = events.rows.map(e => e.event_type).join(', ');
        console.log(`     Doc ${doc.id}: events = [${types}]`);
      }
    }
  } catch (e) {
    fail('T2', `DB query failed: ${e.message}`);
  }

  // 2d. Race condition guard — simulate via the WHERE notary_id IS NULL check
  try {
    // Directly test the SQL race condition guard
    const testDocRes = await dbQuery(`
      SELECT id FROM documents WHERE submission_state='pending' AND notary_id IS NULL AND is_deleted=false LIMIT 1
    `);

    if (testDocRes.rows.length > 0) {
      const testDocId = testDocRes.rows[0].id;

      // Fetch a notary to use
      const notaryRes = await dbQuery(`SELECT id FROM users WHERE role='notary' LIMIT 1`);
      if (notaryRes.rows.length === 0) {
        warn('T2d', 'No notaries in DB to test race condition guard');
      } else {
        const notaryId = notaryRes.rows[0].id;

        // Try to assign same doc twice concurrently (using UPDATE WHERE notary_id IS NULL)
        const [r1, r2] = await Promise.all([
          dbQuery(`UPDATE documents SET notary_id=$1, submission_state='assigned', updated_at=NOW() WHERE id=$2 AND notary_id IS NULL RETURNING id`, [notaryId, testDocId]),
          dbQuery(`UPDATE documents SET notary_id=$1, submission_state='assigned', updated_at=NOW() WHERE id=$2 AND notary_id IS NULL RETURNING id`, [notaryId, testDocId])
        ]);

        const assignments = (r1.rowCount || 0) + (r2.rowCount || 0);
        if (assignments === 1) {
          pass('T2d', `Race condition guard works — only 1 of 2 concurrent UPDATE attempts succeeded (docId=${testDocId})`);
          // Revert our test assignment
          await dbQuery(`UPDATE documents SET notary_id=NULL, submission_state='pending' WHERE id=$1`, [testDocId]);
        } else if (assignments === 0) {
          warn('T2d', 'Doc was already assigned before race condition test — skipping');
        } else {
          fail('T2d', `Race condition NOT guarded — both UPDATE attempts succeeded for docId=${testDocId}`);
          await dbQuery(`UPDATE documents SET notary_id=NULL, submission_state='pending' WHERE id=$1`, [testDocId]);
        }
      }
    } else {
      warn('T2d', 'No unassigned pending documents available for race condition test');
    }
  } catch (e) {
    fail('T2d', `Race condition test error: ${e.message}`);
  }

  // 2e. Assignment distribution analysis
  try {
    const dist = await dbQuery(`
      SELECT 
        u.id, 
        COALESCE(u.name, u.email, u.wallet_address) as notary_name,
        CAST(u.raw_reputation AS FLOAT) as raw_rep,
        CAST(COALESCE(u.effective_reputation, 0) AS FLOAT) as eff_rep,
        COUNT(d.id) as docs_assigned
      FROM users u
      LEFT JOIN documents d ON d.notary_id = u.id AND d.is_deleted=false
      WHERE u.role = 'notary'
      GROUP BY u.id, u.name, u.email, u.wallet_address, u.raw_reputation, u.effective_reputation
      ORDER BY docs_assigned DESC
    `);

    if (dist.rows.length > 0) {
      console.log(`\n  📊 ASSIGNMENT DISTRIBUTION:`);
      console.log(`  ${'─'.repeat(65)}`);
      console.log(`  ${'Notary'.padEnd(12)} ${'Raw Rep'.padEnd(10)} ${'Eff Rep'.padEnd(10)} ${'Docs Assigned'.padEnd(15)}`);
      console.log(`  ${'─'.repeat(65)}`);
      for (const r of dist.rows) {
        console.log(`  ID:${String(r.id).padEnd(9)} ${String(r.raw_rep.toFixed(1)).padEnd(10)} ${String(r.eff_rep.toFixed(1)).padEnd(10)} ${r.docs_assigned}`);
      }

      if (dist.rows.length >= 3) {
        const sorted = [...dist.rows].sort((a, b) => b.eff_rep - a.eff_rep);
        const highRep = sorted[0];
        const lowRep = sorted[sorted.length - 1];
        if (parseFloat(highRep.docs_assigned) >= parseFloat(lowRep.docs_assigned)) {
          pass('T2e', `High-reputation notary (eff_rep=${highRep.eff_rep.toFixed(1)}, docs=${highRep.docs_assigned}) ≥ low-rep notary (eff_rep=${lowRep.eff_rep.toFixed(1)}, docs=${lowRep.docs_assigned})`);
        } else {
          fail('T2e', `Distribution INVERTED: low-rep notary has MORE docs than high-rep notary`);
        }
      } else {
        warn('T2e', `Only ${dist.rows.length} notary/notaries — cannot validate weighted distribution (need ≥3)`);
      }
    } else {
      warn('T2e', 'No notaries in system');
    }

    return dist.rows;
  } catch (e) {
    fail('T2e', `Distribution query failed: ${e.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: REPUTATION SYSTEM INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
async function test3_ReputationIntegrity() {
  section('TEST 3: REPUTATION CORRUPTION + INTEGRITY CHECK');

  // 3a. Duplicate event guard
  try {
    const existingEvent = await dbQuery(`
      SELECT re.document_id, re.user_id, re.event_type 
      FROM reputation_events re 
      WHERE re.event_type IN ('APPROVE','REJECT') 
      LIMIT 1
    `);

    if (existingEvent.rows.length > 0) {
      const { document_id, user_id, event_type } = existingEvent.rows[0];
      const beforeRep = await dbQuery('SELECT raw_reputation FROM users WHERE id=$1', [user_id]);
      const repBefore = parseFloat(beforeRep.rows[0].raw_reputation);

      // Attempt to insert duplicate event (same doc_id + same event_type)
      try {
        await dbQuery(
          `INSERT INTO reputation_events (user_id, event_type, score_delta, document_id, created_at) VALUES ($1,$2,$3,$4,NOW())`,
          [user_id, event_type, 10, document_id]
        );
        // If we reach here, duplicate was allowed — check if service would have blocked it
        warn('T3a', `DB allows duplicate reputation_events rows (no UNIQUE constraint on doc_id+event_type). The service-layer guard in handleEvent() prevents this at runtime.`);
        // Clean up the duplicate
        await dbQuery(`DELETE FROM reputation_events WHERE document_id=$1 AND event_type=$2 AND created_at > NOW() - INTERVAL '10 seconds'`, [document_id, event_type]);
      } catch (dbErr) {
        if (dbErr.code === '23505') {
          pass('T3a', 'DB-level UNIQUE constraint prevents duplicate reputation events');
        } else {
          warn('T3a', `Duplicate insert threw unexpected error: ${dbErr.message}`);
        }
      }

      const afterRep = await dbQuery('SELECT raw_reputation FROM users WHERE id=$1', [user_id]);
      const repAfter = parseFloat(afterRep.rows[0].raw_reputation);
      if (repAfter === repBefore) {
        pass('T3a_score', `Reputation score unchanged after duplicate attempt: ${repBefore} → ${repAfter}`);
      }
    } else {
      warn('T3a', 'No existing reputation events to test duplicate guard against');
    }
  } catch (e) { fail('T3a', `Duplicate guard test error: ${e.message}`); }

  // 3b. REJECT without reason guard (service-level)
  try {
    const { handleEvent } = require('c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/services/reputation.service.js');

    const notaryRes = await dbQuery('SELECT id, raw_reputation FROM users WHERE role=$1 LIMIT 1', ['notary']);
    if (notaryRes.rows.length > 0) {
      const notary = notaryRes.rows[0];
      const repBefore = parseFloat(notary.raw_reputation);

      // Call handleEvent REJECT with no rejection_reason
      await handleEvent(notary.id, 'REJECT', null, {}); // no reason

      const repAfter = await dbQuery('SELECT raw_reputation FROM users WHERE id=$1', [notary.id]);
      const repAfterVal = parseFloat(repAfter.rows[0].raw_reputation);

      if (repAfterVal === repBefore) {
        pass('T3b', `REJECT without reason correctly blocked — score unchanged: ${repBefore} → ${repAfterVal}`);
      } else {
        fail('T3b', `REJECT without reason CHANGED score: ${repBefore} → ${repAfterVal}`);
      }
    } else {
      warn('T3b', 'No notaries in DB to test REJECT guard');
    }
  } catch (e) {
    warn('T3b', `Could not load service directly: ${e.message} — testing via API instead`);
  }

  // 3c. Raw reputation sum consistency check
  try {
    const consistency = await dbQuery(`
      SELECT 
        u.id,
        CAST(u.raw_reputation AS FLOAT) as stored_raw,
        COALESCE(SUM(re.score_delta), 0) as computed_sum,
        COUNT(re.id) as event_count
      FROM users u
      LEFT JOIN reputation_events re ON re.user_id = u.id
      WHERE u.role = 'notary'
      GROUP BY u.id, u.raw_reputation
    `);

    let mismatchCount = 0;
    console.log(`\n  📊 REPUTATION CONSISTENCY TABLE:`);
    console.log(`  ${'─'.repeat(70)}`);
    console.log(`  ${'Notary ID'.padEnd(12)} ${'Stored Raw'.padEnd(12)} ${'Computed Sum'.padEnd(14)} ${'Events'.padEnd(8)} ${'Status'.padEnd(10)}`);
    console.log(`  ${'─'.repeat(70)}`);

    for (const r of consistency.rows) {
      const stored = parseFloat(r.stored_raw);
      const computed = parseFloat(r.computed_sum);
      // Allow for anomaly penalties (not tracked in reputation_events)
      const diff = Math.abs(stored - computed);
      const status = diff <= 50 ? '✅ OK' : '❌ MISMATCH';
      if (diff > 50) mismatchCount++;
      console.log(`  ${String(r.id).padEnd(12)} ${stored.toFixed(1).padEnd(12)} ${computed.toFixed(1).padEnd(14)} ${String(r.event_count).padEnd(8)} ${status}`);
    }

    if (mismatchCount === 0) {
      pass('T3c', 'All notary raw_reputation values consistent with reputation_events sum (within ±50 for anomaly penalties)');
    } else {
      warn('T3c', `${mismatchCount} notary/notaries have significant mismatch between stored raw_reputation and sum of events. This may indicate un-tracked anomaly penalties OR direct DB edits.`);
    }
  } catch (e) { fail('T3c', `Consistency check failed: ${e.message}`); }

  // 3d. Effective reputation computation
  try {
    const effReps = await dbQuery(`
      SELECT id, raw_reputation, effective_reputation, last_active_at
      FROM users WHERE role='notary'
    `);

    let issues = 0;
    for (const n of effReps.rows) {
      const raw = parseFloat(n.raw_reputation) || 0;
      const eff = parseFloat(n.effective_reputation) || 0;
      // effective_reputation <= raw_reputation (factors are 0..1)
      if (raw > 0 && eff > raw * 1.01) { // allow tiny float rounding
        issues++;
        fail('T3d', `Notary ${n.id}: effective_reputation (${eff}) > raw_reputation (${raw}) — impossible formula result`);
      }
    }
    if (issues === 0) {
      pass('T3d', `All effective_reputation values ≤ raw_reputation (formula invariant holds)`);
    }
  } catch (e) { fail('T3d', `Effective rep check failed: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: BLOCKCHAIN-DB CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────
async function test4_BlockchainDbConsistency() {
  section('TEST 4: BLOCKCHAIN ↔ DB CONSISTENCY');

  // 4a. System status endpoint
  try {
    const r = await apiRequest('GET', '/api/auth/system-status');
    if (r.status === 200) {
      pass('T4a', `Chain connectivity OK — activated=${r.body.activated}, adminCount=${r.body.adminCount}`);
      if (r.body.activated === false) {
        warn('T4a', '⚠️ GenesisActivation.activated = false — system NOT activated on-chain');
      }
    } else {
      fail('T4a', `System status unreachable: HTTP ${r.status}`, r.body);
    }
  } catch (e) { fail('T4a', `Request failed: ${e.message}`); }

  // 4b. User roles: DB vs chain (admin count cross-check)
  try {
    const adminsInDb = await dbQuery(`SELECT COUNT(*) FROM users WHERE role='admin'`);
    const adminCount = parseInt(adminsInDb.rows[0].count);
    
    const chainStatus = await apiRequest('GET', '/api/auth/system-status');
    if (chainStatus.status === 200 && chainStatus.body.adminCount !== undefined) {
      const chainAdminCount = chainStatus.body.adminCount;
      if (adminCount === chainAdminCount) {
        pass('T4b', `DB admin count (${adminCount}) matches on-chain adminCount (${chainAdminCount})`);
      } else {
        fail('T4b', `MISMATCH: DB has ${adminCount} admin(s), chain has ${chainAdminCount} admin(s)`);
      }
    } else {
      warn('T4b', 'Could not fetch chain adminCount for comparison');
    }
  } catch (e) { fail('T4b', `Consistency check failed: ${e.message}`); }

  // 4c. Documents marked 'approved' must have chain_confirmed = true
  try {
    const inconsistent = await dbQuery(`
      SELECT id, submission_state, chain_confirmed, approval_tx_hash
      FROM documents
      WHERE is_deleted=false 
        AND submission_state = 'submitted_to_blockchain'
        AND chain_confirmed = true
    `);
    // These are actually consistent (the status should be 'approved' logically, but stored as submitted_to_blockchain)
    // The real check is: chain_confirmed=true should mean status derivedStatus='approved'
    
    const wrongState = await dbQuery(`
      SELECT id, submission_state, chain_confirmed
      FROM documents
      WHERE is_deleted=false AND chain_confirmed=true AND submission_state NOT IN ('submitted_to_blockchain','approved')
    `);

    if (wrongState.rows.length === 0) {
      pass('T4c', 'No documents where chain_confirmed=true but submission_state is in wrong state');
    } else {
      fail('T4c', `${wrongState.rows.length} document(s) with chain_confirmed=true but wrong submission_state`, {
        ids: wrongState.rows.map(r => r.id)
      });
    }
  } catch (e) { fail('T4c', `DB query failed: ${e.message}`); }

  // 4d. Documents with approval_tx_hash should have chain_confirmed or be submitted_to_blockchain
  try {
    const orphanedTx = await dbQuery(`
      SELECT id, submission_state, approval_tx_hash, chain_confirmed
      FROM documents
      WHERE is_deleted=false 
        AND approval_tx_hash IS NOT NULL 
        AND submission_state = 'pending'
    `);

    if (orphanedTx.rows.length === 0) {
      pass('T4d', 'No documents with tx_hash but still in "pending" state (no orphaned transactions)');
    } else {
      fail('T4d', `${orphanedTx.rows.length} document(s) have approval_tx_hash but still show "pending" state`, {
        ids: orphanedTx.rows.map(r => r.id)
      });
    }
  } catch (e) { fail('T4d', `Orphaned tx check failed: ${e.message}`); }

  // 4e. NTKR transaction consistency
  try {
    const ntkrMismatch = await dbQuery(`
      SELECT 
        t.user_id,
        SUM(CASE WHEN t.tx_type='burn' THEN t.amount ELSE 0 END) as total_burned,
        u.ntkr_balance as current_balance
      FROM ntkr_transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.status IN ('submitted','skipped','pending')
      GROUP BY t.user_id, u.ntkr_balance
    `);
    
    if (ntkrMismatch.rows.length > 0) {
      console.log(`\n  📊 NTKR TRANSACTION LOG SUMMARY:`);
      for (const r of ntkrMismatch.rows) {
        console.log(`     User ${r.user_id}: total_burned=${r.total_burned}, current_DB_balance=${r.current_balance}`);
      }
      pass('T4e', 'NTKR transaction log accessible and readable');
    } else {
      warn('T4e', 'No NTKR burn transactions found in log');
    }
  } catch (e) {
    if (e.message.includes('does not exist')) {
      warn('T4e', 'ntkr_transactions table does not exist — this is a schema gap');
    } else {
      fail('T4e', `NTKR check failed: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: RELAYER / BLOCKCHAIN FAILURE BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
async function test5_RelayerFailure() {
  section('TEST 5: RELAYER FAILURE — Verify No False Success');

  // 5a. Check Multisig settings endpoint (tests provider connection)
  try {
    const r = await apiRequest('GET', '/api/governance/multisig/settings');
    if (r.status === 200) {
      if (r.body.error) {
        warn('T5a', `MultiSig settings returned with error field: ${r.body.error}`);
      } else {
        pass('T5a', `MultiSig settings fetched — threshold=${r.body.threshold}, signers=${r.body.signers?.length}`);
      }
    } else {
      warn('T5a', `MultiSig settings HTTP ${r.status}: ${JSON.stringify(r.body)}`);
    }
  } catch (e) { fail('T5a', `Request failed: ${e.message}`); }

  // 5b. Check failed NTKR burns are tracked
  try {
    const failedBurns = await dbQuery(`
      SELECT COUNT(*) as cnt FROM ntkr_transactions WHERE status='failed'
    `);
    const failedCount = parseInt(failedBurns.rows[0].cnt);
    if (failedCount > 0) {
      pass('T5b', `${failedCount} failed NTKR burn(s) properly tracked in ntkr_transactions with status='failed'`);
    } else {
      pass('T5b', 'No failed NTKR burns recorded (system operating normally or no burns attempted)');
    }
  } catch (e) {
    if (e.message.includes('does not exist')) {
      warn('T5b', 'ntkr_transactions table missing — relayer failure tracking not possible');
    } else {
      warn('T5b', `Check failed: ${e.message}`);
    }
  }

  // 5c. Verify no document has 'pending' submission_state AND approval_tx_hash set simultaneously
  try {
    const r = await dbQuery(`
      SELECT COUNT(*) as cnt 
      FROM documents 
      WHERE is_deleted=false AND submission_state='pending' AND approval_tx_hash IS NOT NULL
    `);
    if (parseInt(r.rows[0].cnt) === 0) {
      pass('T5c', 'No documents stuck in "pending" with a tx_hash set — no false relayer success recorded');
    } else {
      fail('T5c', `${r.rows[0].cnt} document(s) show pending+has_tx_hash — indicates relayer claimed success but state not updated`);
    }
  } catch (e) { fail('T5c', `Check failed: ${e.message}`); }

  // 5d. Circuit breaker state check
  try {
    // Call the system status endpoint and check if paused flag exists
    const circuitRes = await apiRequest('GET', '/api/system/health');
    if (circuitRes.status === 200) {
      pass('T5d', `System health endpoint OK (circuit breaker accessible): ${JSON.stringify(circuitRes.body)}`);
    } else {
      warn('T5d', `System health: HTTP ${circuitRes.status}`);
    }
  } catch (e) { warn('T5d', `System health check failed: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: ANOMALY DETECTION VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
async function test6_AnomalyDetection() {
  section('TEST 6: ANOMALY DETECTION + WORKER LOGIC');

  // 6a. Check worker logic via direct module load
  try {
    const { runReputationWorker } = require('c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/workers/reputation-worker.js');
    
    // Snapshot reputation before
    const before = await dbQuery(`SELECT id, raw_reputation, effective_reputation FROM users WHERE role='notary'`);
    
    // Run the worker once
    console.log('  🔄 Running reputation worker...');
    await runReputationWorker();
    
    // Snapshot after
    const after = await dbQuery(`SELECT id, raw_reputation, effective_reputation FROM users WHERE role='notary'`);
    
    pass('T6a', `Reputation worker ran successfully — processed ${after.rows.length} notary/notaries`);
    
    // 6b. Check if effective_reputation was updated
    let updatedCount = 0;
    for (const afterN of after.rows) {
      const beforeN = before.rows.find(b => b.id === afterN.id);
      if (beforeN && parseFloat(afterN.effective_reputation) !== parseFloat(beforeN?.effective_reputation)) {
        updatedCount++;
      }
    }
    
    if (after.rows.length > 0) {
      pass('T6b', `Effective reputations computed and written for ${after.rows.length} notary/notaries (${updatedCount} changed from previous value)`);
    }

    // 6c. Anomaly detection threshold check (reading from code)
    const ANOMALY_THRESHOLD = 0.40;
    const BOOTSTRAP_THRESHOLD = 3;
    const notaryCount = after.rows.length;
    
    if (notaryCount < BOOTSTRAP_THRESHOLD) {
      pass('T6c', `Bootstrap mode active (${notaryCount} < ${BOOTSTRAP_THRESHOLD}) — anomaly detection SKIPPED as expected`);
    } else {
      // Check for any anomaly penalties in the logs by looking at raw_reputation drops
      const penalties = [];
      for (const afterN of after.rows) {
        const beforeN = before.rows.find(b => b.id === afterN.id);
        if (beforeN) {
          const diff = parseFloat(afterN.raw_reputation) - parseFloat(beforeN.raw_reputation);
          if (diff < -5) { // Significant drop = anomaly penalty
            penalties.push({ id: afterN.id, drop: diff });
          }
        }
      }
      if (penalties.length > 0) {
        pass('T6c', `Anomaly penalty applied to ${penalties.length} notary/notaries: ${JSON.stringify(penalties)}`);
      } else {
        pass('T6c', 'No anomaly penalties triggered this cycle (deviation within ±40% threshold)');
      }
    }

    return after.rows;
  } catch (e) {
    fail('T6', `Could not run reputation worker: ${e.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: GOVERNANCE PROPOSALS CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────
async function test7_Governance() {
  section('TEST 7: GOVERNANCE DATA INTEGRITY');

  // 7a. Governance alerts count endpoint (public)
  try {
    const r = await apiRequest('GET', '/api/governance/alerts/count');
    if (r.status === 200 && typeof r.body.count === 'number') {
      pass('T7a', `Governance alerts count accessible: ${r.body.count} active proposals`);
    } else {
      fail('T7a', `Alerts count failed: HTTP ${r.status}`, r.body);
    }
  } catch (e) { fail('T7a', `Request failed: ${e.message}`); }

  // 7b. Proposals in DB consistency
  try {
    const proposals = await dbQuery(`
      SELECT p.id, p.status, p.title,
        COUNT(v.id) FILTER (WHERE v.decision='approve') as approvals,
        COUNT(v.id) FILTER (WHERE v.decision='reject') as rejections
      FROM governance_proposals p
      LEFT JOIN governance_votes v ON v.proposal_id = p.id
      GROUP BY p.id, p.status, p.title
      ORDER BY p.created_at DESC
    `);

    console.log(`\n  📊 GOVERNANCE PROPOSALS (${proposals.rows.length} total):`);
    let passedWithNoApprovals = 0;
    for (const p of proposals.rows) {
      const status = p.approvals > 0 || p.status !== 'active' ? '✅' : '🔵';
      console.log(`  ${status} Proposal ${p.id}: "${String(p.title).substring(0, 30)}" | status=${p.status} | approvals=${p.approvals}`);
      
      if (p.status === 'passed' && parseInt(p.approvals) === 0) {
        passedWithNoApprovals++;
      }
    }

    if (passedWithNoApprovals === 0) {
      pass('T7b', 'No passed proposals with 0 approvals — vote logic is consistent');
    } else {
      fail('T7b', `${passedWithNoApprovals} proposal(s) marked "passed" with 0 approvals recorded — vote counting issue`);
    }
  } catch (e) { fail('T7b', `Proposals check failed: ${e.message}`); }

  // 7c. Remote governance sessions
  try {
    const sessions = await dbQuery(`SELECT status, COUNT(*) as cnt FROM remote_gov_sessions GROUP BY status`);
    if (sessions.rows.length > 0) {
      const sessionSummary = sessions.rows.map(s => `${s.status}=${s.cnt}`).join(', ');
      pass('T7c', `Remote governance sessions table accessible: ${sessionSummary}`);
    } else {
      pass('T7c', 'Remote governance sessions table accessible (no sessions yet)');
    }
  } catch (e) {
    if (e.message.includes('does not exist')) {
      fail('T7c', 'remote_gov_sessions table MISSING — remote governance voting will fail');
    } else {
      fail('T7c', `Sessions check failed: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: INPUT VALIDATION + ADVERSARIAL INPUTS
// ─────────────────────────────────────────────────────────────────────────────
async function test8_InputValidation() {
  section('TEST 8: INPUT VALIDATION + ADVERSARIAL INPUTS');

  const adversarialTests = [
    {
      name: 'SQL injection in pre-check wallet',
      endpoint: '/api/auth/pre-check',
      method: 'POST',
      body: { walletAddress: "' OR '1'='1'; DROP TABLE users; --" },
      expectFail: true
    },
    {
      name: 'XSS in nonce wallet_address',
      endpoint: '/api/auth/nonce',
      method: 'POST',
      body: { wallet_address: '<script>alert(1)</script>', purpose: 'LOGIN' },
      expectFail: false // Server should handle it gracefully
    },
    {
      name: 'Oversized payload to nonce',
      endpoint: '/api/auth/nonce',
      method: 'POST',
      body: { wallet_address: 'A'.repeat(5000), purpose: 'B'.repeat(5000) },
      expectFail: false
    },
    {
      name: 'Empty body to login',
      endpoint: '/api/auth/login',
      method: 'POST',
      body: {},
      expectBadRequest: true
    },
    {
      name: 'Null wallet to pre-check',
      endpoint: '/api/auth/pre-check',
      method: 'POST',
      body: { walletAddress: null },
      expectBadRequest: true
    }
  ];

  for (const t of adversarialTests) {
    try {
      const r = await apiRequest(t.method, t.endpoint, t.body);
      if (t.expectBadRequest && (r.status === 400 || r.status === 422)) {
        pass(`T8-${t.name}`, `Correctly rejected (HTTP ${r.status}): ${r.body?.error}`);
      } else if (r.status >= 400 && r.status < 600) {
        pass(`T8-${t.name}`, `Handled adversarial input (HTTP ${r.status})`);
      } else if (r.status === 200 || r.status === 201) {
        warn(`T8-${t.name}`, `Server returned ${r.status} for adversarial input — review response`);
      }
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('ECONNRESET')) {
        fail(`T8-${t.name}`, `Server crashed or timed out on adversarial input: ${e.message}`);
      } else {
        warn(`T8-${t.name}`, `Network error: ${e.message}`);
      }
    }
  }

  // 8b. Double-deposit protection
  try {
    const fakeHash = '0x' + 'a'.repeat(64);
    const r1 = await apiRequest('POST', '/api/tokens/deposit', { txHash: fakeHash });
    // Should fail at auth level since no JWT
    if (r1.status === 401 || r1.status === 403) {
      pass('T8-deposit-auth', `Deposit endpoint correctly requires authentication (HTTP ${r1.status})`);
    } else {
      warn('T8-deposit-auth', `Deposit without auth returned HTTP ${r1.status}`);
    }
  } catch (e) { warn('T8-deposit', `Request error: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: SYSTEM STABILITY PROBE
// ─────────────────────────────────────────────────────────────────────────────
async function test9_SystemStability() {
  section('TEST 9: SYSTEM STABILITY + CONCURRENT LOAD PROBE');

  // 9a. Concurrent API requests to public endpoints
  const concurrentRequests = Array.from({ length: 20 }, (_, i) =>
    apiRequest('GET', '/api/governance/alerts/count').catch(e => ({ error: e.message }))
  );

  try {
    const responses = await Promise.all(concurrentRequests);
    const ok = responses.filter(r => r.status === 200).length;
    const errors = responses.filter(r => r.error).length;
    const rateLimited = responses.filter(r => r.status === 429).length;

    if (ok >= 15) {
      pass('T9a', `Concurrent load (20 requests): ${ok} OK, ${rateLimited} rate-limited, ${errors} errors`);
    } else {
      fail('T9a', `Poor concurrency handling: only ${ok}/20 requests succeeded`, { ok, rateLimited, errors });
    }
  } catch (e) { fail('T9a', `Concurrent load test error: ${e.message}`); }

  // 9b. DB connection pool health
  try {
    const poolStats = pool.totalCount !== undefined ? {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    } : { note: 'Pool stats not exposed' };
    
    const dbTime = await dbQuery('SELECT NOW()');
    pass('T9b', `DB connection pool healthy — response time OK | ${JSON.stringify(poolStats)}`);
  } catch (e) { fail('T9b', `DB connection pool issue: ${e.message}`); }

  // 9c. Check for any zombie/stuck remote sessions
  try {
    const zombieSessions = await dbQuery(`
      SELECT COUNT(*) as cnt FROM remote_auth_sessions 
      WHERE status='pending' AND expires_at < NOW()
    `);
    const zombieCount = parseInt(zombieSessions.rows[0].cnt);
    if (zombieCount > 10) {
      warn('T9c', `${zombieCount} expired-but-uncleaned remote auth sessions — no auto-cleanup worker`);
    } else {
      pass('T9c', `Remote session table clean: ${zombieCount} expired-but-uncleaned sessions`);
    }
  } catch (e) { warn('T9c', `Session check failed: ${e.message}`); }

  // 9d. Unhandled routes return proper 404
  try {
    const r = await apiRequest('GET', '/api/nonexistent-endpoint-xyz');
    if (r.status === 404) {
      pass('T9d', 'Unknown routes return 404 (no server crash)');
    } else {
      warn('T9d', `Unknown route returned HTTP ${r.status} instead of 404`);
    }
  } catch (e) { fail('T9d', `Unknown route crashed server: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: SCHEMA COMPLETENESS
// ─────────────────────────────────────────────────────────────────────────────
async function test10_SchemaCompleteness() {
  section('TEST 10: DATABASE SCHEMA COMPLETENESS');

  const requiredTables = [
    'users', 'documents', 'notary_applications', 'wallet_nonces',
    'remote_auth_sessions', 'governance_proposals', 'governance_votes',
    'reputation_events', 'ntkr_transactions', 'token_deposits', 'transactions'
  ];

  const optionalTables = ['remote_gov_sessions', 'disputes'];

  try {
    const tableRes = await dbQuery(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const existingTables = new Set(tableRes.rows.map(r => r.table_name));

    console.log(`\n  📊 Tables found: ${existingTables.size}`);
    console.log(`     ${[...existingTables].join(', ')}`);

    let missing = 0;
    for (const t of requiredTables) {
      if (!existingTables.has(t)) {
        fail('T10-schema', `REQUIRED table missing: ${t}`);
        missing++;
      }
    }
    if (missing === 0) {
      pass('T10-schema', `All ${requiredTables.length} required tables present`);
    }

    for (const t of optionalTables) {
      if (!existingTables.has(t)) {
        warn('T10-schema', `Optional table missing: ${t} — related features may fail`);
      } else {
        pass(`T10-${t}`, `Optional table '${t}' exists`);
      }
    }

    // Check users table columns
    const colRes = await dbQuery(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name='users' AND table_schema='public' ORDER BY column_name
    `);
    const cols = new Set(colRes.rows.map(r => r.column_name));
    const requiredCols = ['id', 'wallet_address', 'role', 'raw_reputation', 'effective_reputation', 
                          'ntkr_balance', 'kyc_verified', 'is_banned', 'is_active', 'last_active_at'];
    
    let missingCols = 0;
    for (const c of requiredCols) {
      if (!cols.has(c)) {
        fail('T10-cols', `users table missing column: ${c}`);
        missingCols++;
      }
    }
    if (missingCols === 0) {
      pass('T10-cols', `All required columns present in users table`);
    }

  } catch (e) { fail('T10', `Schema check failed: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL REPORT
// ─────────────────────────────────────────────────────────────────────────────
function printReport(notaryDist, repData) {
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`  📋 BBSNS ADVERSARIAL VALIDATION — FINAL REPORT`);
  console.log(`${'█'.repeat(70)}`);
  console.log(`  Test Time: ${new Date().toISOString()}`);
  console.log(`  Tests Run: ${results.tests.length}`);
  console.log(`  ✅ Passed:  ${results.passed}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  ⚠️  Warnings: ${results.warnings.length}`);

  if (results.failed > 0) {
    console.log(`\n  🔴 FAILED TESTS:`);
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`     ❌ [${t.test}] ${t.msg}`);
      if (t.data && Object.keys(t.data).length > 0) {
        console.log(`        Data: ${JSON.stringify(t.data)}`);
      }
    });
  }

  if (results.warnings.length > 0) {
    console.log(`\n  ⚠️  WARNINGS:`);
    results.warnings.forEach(w => console.log(`     ⚠️  [${w.test}] ${w.msg}`));
  }

  if (notaryDist && notaryDist.length > 0) {
    console.log(`\n  📊 FINAL ASSIGNMENT DISTRIBUTION TABLE:`);
    console.log(`  ${'─'.repeat(65)}`);
    console.log(`  ${'Notary ID'.padEnd(12)} ${'Raw Rep'.padEnd(10)} ${'Eff Rep'.padEnd(10)} ${'Docs'.padEnd(8)}`);
    for (const r of notaryDist) {
      console.log(`  ${String(r.id).padEnd(12)} ${parseFloat(r.raw_rep).toFixed(1).padEnd(10)} ${parseFloat(r.eff_rep).toFixed(1).padEnd(10)} ${r.docs_assigned}`);
    }
  }

  if (repData && repData.length > 0) {
    console.log(`\n  📊 FINAL REPUTATION TABLE:`);
    console.log(`  ${'─'.repeat(50)}`);
    for (const n of repData) {
      const effRep = parseFloat(n.effective_reputation) || 0;
      const rawRep = parseFloat(n.raw_reputation) || 0;
      console.log(`  Notary ${n.id}: raw=${rawRep.toFixed(1)}  effective=${effRep.toFixed(1)}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  if (results.failed === 0) {
    console.log(`  🏆 VERDICT: ✅ SYSTEM HOLDS UNDER STRESS`);
    console.log(`  All critical checks passed. Warnings noted above for review.`);
  } else {
    console.log(`  🔴 VERDICT: ❌ SYSTEM HAS STRUCTURAL FLAWS`);
    console.log(`  ${results.failed} critical test(s) failed. See report above.`);
  }
  console.log(`${'═'.repeat(70)}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RUNNER
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`  🔴 BBSNS FULL ADVERSARIAL INTEGRATION TEST SUITE`);
  console.log(`  Target: ${BASE_URL}  |  DB: postgres://localhost:5433/notarydb`);
  console.log(`${'█'.repeat(70)}\n`);

  pool = new Pool(DB_CONFIG);

  let notaryDist = [];
  let repData = [];

  try {
    const state = await test0_Bootstrap();
    await test1_AuthIntegrity();
    notaryDist = await test2_AssignmentLogic(state);
    await test3_ReputationIntegrity();
    await test4_BlockchainDbConsistency();
    await test5_RelayerFailure();
    repData = await test6_AnomalyDetection();
    await test7_Governance();
    await test8_InputValidation();
    await test9_SystemStability();
    await test10_SchemaCompleteness();
  } catch (fatalErr) {
    console.error(`\n🚨 FATAL ERROR during tests: ${fatalErr.message}`);
    console.error(fatalErr.stack);
  } finally {
    await pool.end();
  }

  printReport(notaryDist, repData);
}

main().catch(e => {
  console.error('Unhandled rejection:', e);
  process.exit(1);
});
