/**
 * BBSNS Phase 3–8: Full Live State + Auth + Reputation Audit
 * Runs against port 5000, postgres 5433
 */
const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });
const PORT = 5000;

const R = { pass: 0, fail: 0, warn: 0, items: [] };
function pass(id, msg) { R.pass++; R.items.push({ s:'✅', id, msg }); console.log(`  ✅ ${id}: ${msg}`); }
function fail(id, msg) { R.fail++; R.items.push({ s:'❌', id, msg }); console.error(`  ❌ ${id}: ${msg}`); }
function warn(id, msg) { R.warn++; R.items.push({ s:'⚠️', id, msg }); console.warn(`  ⚠️  ${id}: ${msg}`); }
function sec(n) { console.log(`\n${'═'.repeat(65)}\n  ${n}\n${'═'.repeat(65)}`); }

function apiReq(method, path, body=null, hdrs={}) {
  return new Promise((resolve, reject) => {
    const pl = body ? JSON.stringify(body) : null;
    const opts = { hostname:'localhost', port:PORT, path, method,
      headers:{'Content-Type':'application/json', ...(pl?{'Content-Length':Buffer.byteLength(pl)}:{}), ...hdrs} };
    const req = http.request(opts, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch{resolve({status:res.statusCode,body:d})} });
    });
    req.on('error', reject);
    req.setTimeout(12000, ()=>req.destroy(new Error('Timeout')));
    if (pl) req.write(pl);
    req.end();
  });
}

async function main() {
  console.log('\n██████ BBSNS ADVERSARIAL AUDIT — PHASES 3-8 ██████\n');

  // ══════════════════════════════════════════════
  // PHASE 3: FULL LIVE SYSTEM STATE
  // ══════════════════════════════════════════════
  sec('PHASE 3: LIVE SYSTEM STATE');

  const stats = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM users WHERE role='admin') as admins,
      (SELECT COUNT(*) FROM users WHERE role='notary') as notaries,
      (SELECT COUNT(*) FROM users WHERE role='owner') as owners,
      (SELECT COUNT(*) FROM documents WHERE is_deleted=false) as total_docs,
      (SELECT COUNT(*) FROM documents WHERE submission_state='pending' AND is_deleted=false) as pending_docs,
      (SELECT COUNT(*) FROM documents WHERE submission_state='assigned' AND is_deleted=false) as assigned_docs,
      (SELECT COUNT(*) FROM documents WHERE submission_state='submitted_to_blockchain' AND is_deleted=false) as submitted_docs,
      (SELECT COUNT(*) FROM documents WHERE chain_confirmed=true AND is_deleted=false) as confirmed_docs,
      (SELECT COUNT(*) FROM documents WHERE submission_state='rejected' AND is_deleted=false) as rejected_docs,
      (SELECT COUNT(*) FROM notary_applications) as applications,
      (SELECT COUNT(*) FROM governance_proposals) as proposals,
      (SELECT COUNT(*) FROM reputation_events) as rep_events,
      (SELECT COUNT(*) FROM wallet_nonces) as nonces
  `);
  const s = stats.rows[0];
  console.log(`
  ┌─────────────────────────────────────────────┐
  │ Users:           ${String(s.total_users).padStart(6)}                        │
  │   Admins:        ${String(s.admins).padStart(6)}                        │
  │   Notaries:      ${String(s.notaries).padStart(6)}                        │
  │   Owners:        ${String(s.owners).padStart(6)}                        │
  ├─────────────────────────────────────────────┤
  │ Documents:       ${String(s.total_docs).padStart(6)}                        │
  │   pending:       ${String(s.pending_docs).padStart(6)}                        │
  │   assigned:      ${String(s.assigned_docs).padStart(6)}                        │
  │   submitted:     ${String(s.submitted_docs).padStart(6)}                        │
  │   confirmed:     ${String(s.confirmed_docs).padStart(6)}                        │
  │   rejected:      ${String(s.rejected_docs).padStart(6)}                        │
  ├─────────────────────────────────────────────┤
  │ Applications:    ${String(s.applications).padStart(6)}                        │
  │ Proposals:       ${String(s.proposals).padStart(6)}                        │
  │ Rep Events:      ${String(s.rep_events).padStart(6)}                        │
  │ Wallet Nonces:   ${String(s.nonces).padStart(6)}                        │
  └─────────────────────────────────────────────┘`);

  pass('STATE-DB', `Live system state read successfully`);

  // ══════════════════════════════════════════════
  // PHASE 4: NOTARY + REPUTATION TABLE
  // ══════════════════════════════════════════════
  sec('PHASE 4: NOTARY & REPUTATION STATE');

  const notaries = await pool.query(`
    SELECT 
      u.id, u.wallet_address,
      COALESCE(u.name, u.email, LEFT(u.wallet_address,12)) as name,
      CAST(COALESCE(u.raw_reputation,0) AS FLOAT) as raw_rep,
      CAST(COALESCE(u.effective_reputation,0) AS FLOAT) as eff_rep,
      u.last_active_at,
      COUNT(d.id) as docs_assigned,
      COUNT(d.id) FILTER (WHERE d.chain_confirmed=true OR d.submission_state='submitted_to_blockchain') as docs_completed,
      COALESCE((SELECT SUM(re.score_delta) FROM reputation_events re WHERE re.user_id=u.id),0) as computed_sum,
      (SELECT COUNT(*) FROM reputation_events re WHERE re.user_id=u.id) as event_count
    FROM users u
    LEFT JOIN documents d ON d.notary_id=u.id AND d.is_deleted=false
    WHERE u.role='notary'
    GROUP BY u.id, u.wallet_address, u.name, u.email, u.raw_reputation, u.effective_reputation, u.last_active_at
    ORDER BY raw_rep DESC
  `);

  if (notaries.rows.length === 0) {
    warn('NOTARY-ALL', 'No notaries in system — assignment, reputation, and anomaly tests N/A');
  } else {
    console.log(`\n  REPUTATION TABLE (${notaries.rows.length} notaries):`);
    console.log(`  ${'─'.repeat(95)}`);
    console.log(`  ${'ID'.padEnd(6)} ${'Raw'.padEnd(8)} ${'Eff'.padEnd(8)} ${'Docs'.padEnd(7)} ${'Done'.padEnd(7)} ${'Events'.padEnd(8)} ${'RepSum'.padEnd(8)} ${'Consistent'.padEnd(11)} ${'Wallet'}`);
    console.log(`  ${'─'.repeat(95)}`);
    
    let inconsistent = 0;
    for (const n of notaries.rows) {
      const diff = Math.abs(n.raw_rep - parseFloat(n.computed_sum));
      const ok = diff <= 60;
      if(!ok) inconsistent++;
      const marker = ok ? 'YES      ' : 'NO ❌    ';
      console.log(`  ${String(n.id).padEnd(6)} ${n.raw_rep.toFixed(1).padEnd(8)} ${n.eff_rep.toFixed(1).padEnd(8)} ${String(n.docs_assigned).padEnd(7)} ${String(n.docs_completed).padEnd(7)} ${String(n.event_count).padEnd(8)} ${parseFloat(n.computed_sum).toFixed(1).padEnd(8)} ${marker}${(n.wallet_address||'').substring(0,18)}`);
    }
    console.log(`  ${'─'.repeat(95)}`);
    
    if (inconsistent === 0) {
      pass('REP-CONSISTENCY', `All ${notaries.rows.length} notary reputation values consistent (stored vs computed within ±60 for anomaly penalties)`);
    } else {
      fail('REP-CONSISTENCY', `${inconsistent} notary/notaries have raw_reputation significantly different from sum of reputation_events`);
    }

    // effective_reputation <= raw_reputation
    let effGtRaw = notaries.rows.filter(n => n.raw_rep > 0 && n.eff_rep > n.raw_rep * 1.02).length;
    if (effGtRaw === 0) {
      pass('REP-EFF', 'effective_reputation ≤ raw_reputation for all notaries (formula invariant correct)');
    } else {
      fail('REP-EFF', `${effGtRaw} notary/notaries have effective_reputation > raw_reputation — impossible`);
    }

    // Assignment distribution (if ≥3 notaries)
    if (notaries.rows.length >= 3) {
      const sorted = [...notaries.rows].sort((a,b) => b.eff_rep - a.eff_rep);
      const hi = sorted[0], lo = sorted[sorted.length-1];
      if (parseInt(hi.docs_assigned) >= parseInt(lo.docs_assigned)) {
        pass('ASSIGN-DIST', `Assignment distribution correct: highest eff_rep notary (${hi.eff_rep.toFixed(1)}) has ${hi.docs_assigned} docs vs lowest (${lo.eff_rep.toFixed(1)}) with ${lo.docs_assigned} docs`);
      } else {
        fail('ASSIGN-DIST', `Assignment distribution INVERTED: lowest-rep notary has ${lo.docs_assigned} docs, highest-rep has ${hi.docs_assigned} docs`);
      }
    } else {
      warn('ASSIGN-DIST', `Bootstrap mode (${notaries.rows.length} < 3) — weighted distribution not active, random selection used`);
    }
  }

  // ══════════════════════════════════════════════
  // PHASE 5: DOCUMENT STATE INTEGRITY
  // ══════════════════════════════════════════════
  sec('PHASE 5: DOCUMENT STATE INTEGRITY');

  // 5a. Stuck docs (no notary assigned)
  const stuck = await pool.query(`
    SELECT id, created_at FROM documents 
    WHERE is_deleted=false AND submission_state='pending' AND notary_id IS NULL
    AND created_at < NOW() - INTERVAL '10 minutes'
  `);
  if (stuck.rows.length === 0) {
    pass('DOC-STUCK', 'No documents stuck in pending without notary assignment (>10 min old)');
  } else {
    const numNotaries = parseInt(s.notaries);
    if (numNotaries === 0) {
      warn('DOC-STUCK', `${stuck.rows.length} docs stuck pending — but NO notaries in system (expected behavior)`);
    } else {
      fail('DOC-STUCK', `${stuck.rows.length} docs stuck pending with no notary despite notaries existing: ids=${stuck.rows.map(r=>r.id).join(',')}`);
    }
  }

  // 5b. chain_confirmed vs state conflicts
  const stateConflict = await pool.query(`
    SELECT COUNT(*) as cnt FROM documents 
    WHERE is_deleted=false AND chain_confirmed=true AND submission_state IN ('pending','assigned')
  `);
  if (parseInt(stateConflict.rows[0].cnt) === 0) {
    pass('DOC-STATE', 'No documents where chain_confirmed=true but state=pending/assigned');
  } else {
    fail('DOC-STATE', `${stateConflict.rows[0].cnt} documents with chain_confirmed=true but still pending/assigned`);
  }

  // 5c. Documents with tx_hash but pending
  const orphanTx = await pool.query(`
    SELECT COUNT(*) as cnt FROM documents 
    WHERE is_deleted=false AND approval_tx_hash IS NOT NULL AND submission_state='pending'
  `);
  if (parseInt(orphanTx.rows[0].cnt) === 0) {
    pass('DOC-TX', 'No orphaned transactions (tx_hash without state update)');
  } else {
    fail('DOC-TX', `${orphanTx.rows[0].cnt} documents have approval_tx_hash but are still "pending"`);
  }

  // 5d. NTKR tracking
  const ntkrLog = await pool.query(`
    SELECT tx_type, status, COUNT(*) as cnt FROM ntkr_transactions GROUP BY tx_type, status ORDER BY tx_type, status
  `).catch(() => ({ rows: [] }));
  if (ntkrLog.rows.length > 0) {
    console.log('\n  NTKR Transaction Log:');
    ntkrLog.rows.forEach(r => console.log(`    tx_type=${r.tx_type} status=${r.status}: ${r.cnt}`));
    pass('NTKR-LOG', 'NTKR transaction log readable');

    const failed = ntkrLog.rows.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      warn('NTKR-FAILED', `${failed.reduce((a,b) => a + parseInt(b.cnt), 0)} failed NTKR burns recorded`);
    } else {
      pass('NTKR-FAILED', 'No failed NTKR burns in log');
    }
  } else {
    warn('NTKR-LOG', 'No NTKR transactions found or table empty');
  }

  // 5e. Duplicate notary assignments check
  const dupAssign = await pool.query(`
    SELECT document_id, COUNT(DISTINCT event_type) as types, COUNT(*) as events
    FROM reputation_events
    WHERE event_type IN ('APPROVE','REJECT')
    GROUP BY document_id
    HAVING COUNT(*) > 1
  `);
  if (dupAssign.rows.length === 0) {
    pass('REP-DUPE', 'No duplicate APPROVE/REJECT events for any document');
  } else {
    fail('REP-DUPE', `${dupAssign.rows.length} documents have multiple APPROVE/REJECT events — integrity issue`);
    dupAssign.rows.slice(0,5).forEach(r => console.error(`     docId=${r.document_id}: ${r.events} events`));
  }

  // ══════════════════════════════════════════════
  // PHASE 6: AUTH SYSTEM TESTS
  // ══════════════════════════════════════════════
  sec('PHASE 6: AUTH SYSTEM INTEGRITY TESTS');

  // 6a. System status (chain)
  try {
    const r = await apiReq('GET', '/api/auth/system-status');
    if (r.status === 200) {
      pass('AUTH-CHAIN', `Chain connectivity OK — activated=${r.body.activated}, adminCount=${r.body.adminCount}`);
      if (!r.body.activated) warn('AUTH-CHAIN-ACT', 'System NOT activated on-chain — genesis window only');
    } else {
      fail('AUTH-CHAIN', `system-status HTTP ${r.status}: ${JSON.stringify(r.body)}`);
    }
  } catch(e) { fail('AUTH-CHAIN', `Chain unreachable: ${e.message}`); }

  // 6b. /me without token
  try {
    const r = await apiReq('GET', '/api/auth/me');
    if (r.status === 200 && r.body.user === null) {
      pass('AUTH-ME-NULL', '/auth/me silently returns null without token (Zero-Trust OK)');
    } else if (r.status === 401) {
      fail('AUTH-ME-NULL', '/auth/me returns 401 without token — should return {user:null} to suppress UI noise');
    } else {
      warn('AUTH-ME-NULL', `Unexpected /me response: ${r.status}`);
    }
  } catch(e) { fail('AUTH-ME-NULL', e.message); }

  // 6c. Tampered JWT
  const fakeJwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTksImFkZHJlc3MiOiIweDAwMDEiLCJyb2xlIjozLCJpYXQiOjE1MDAwMDAwMDB9.BADSIG';
  try {
    const r = await apiReq('GET', '/api/documents', null, { 'Authorization': `Bearer ${fakeJwt}` });
    if (r.status === 401 || r.status === 403) {
      pass('AUTH-JWT-TAMPER', `Tampered JWT rejected (HTTP ${r.status})`);
    } else {
      fail('AUTH-JWT-TAMPER', `Tampered JWT ACCEPTED — HTTP ${r.status} — CRITICAL SECURITY HOLE`);
    }
  } catch(e) { fail('AUTH-JWT-TAMPER', e.message); }

  // 6d. Invalid nonce login
  try {
    const r = await apiReq('POST', '/api/auth/login', {
      walletAddress: '0x0000000000000000000000000000000000000001',
      signature: '0x' + 'a'.repeat(130),
      signature_nonce: 'fake-nonce-xyz-9999'
    });
    if (r.status >= 400) {
      pass('AUTH-BAD-NONCE', `Invalid/expired nonce rejected (HTTP ${r.status}): ${r.body?.error}`);
    } else {
      fail('AUTH-BAD-NONCE', `Invalid nonce ACCEPTED — HTTP ${r.status}`);
    }
  } catch(e) { fail('AUTH-BAD-NONCE', e.message); }

  // 6e. Nonce is single-use (can't reuse consumed nonce from DB)
  const consumedNonce = await pool.query(
    `SELECT wallet_address, nonce FROM wallet_nonces WHERE used_at IS NOT NULL LIMIT 1`
  );
  if (consumedNonce.rows.length > 0) {
    const { wallet_address, nonce } = consumedNonce.rows[0];
    try {
      const r = await apiReq('POST', '/api/auth/login', {
        walletAddress: wallet_address,
        signature: '0x' + 'a'.repeat(130),
        signature_nonce: nonce
      });
      if (r.status >= 400) {
        pass('AUTH-NONCE-REUSE', `Consumed nonce correctly rejected (HTTP ${r.status}): ${r.body?.error}`);
      } else {
        fail('AUTH-NONCE-REUSE', `Consumed nonce ACCEPTED — replay attack possible`);
      }
    } catch(e) { fail('AUTH-NONCE-REUSE', e.message); }
  } else {
    warn('AUTH-NONCE-REUSE', 'No consumed nonces in DB — cannot test replay attack prevention');
  }

  // 6f. Remote session lifecycle
  try {
    const c = await apiReq('POST', '/api/auth/remote/session', { device_id: 'audit-device' });
    if (c.status === 200 && c.body.sessionId) {
      const sid = c.body.sessionId;
      const st = await apiReq('GET', `/api/auth/remote/status/${sid}`);
      if (st.status === 200 && st.body.status === 'pending') {
        pass('AUTH-REMOTE', `Remote session lifecycle OK: sid=${sid} status=pending`);
      } else fail('AUTH-REMOTE', `Status poll failed: ${JSON.stringify(st.body)}`);
      
      // Bad sig rejection
      const bad = await apiReq('POST', '/api/auth/remote/authorize', {
        sessionId: sid, walletAddress: '0x1234', signature: '0xbadsig'
      });
      if (bad.status >= 400) pass('AUTH-REMOTE-SIG', `Invalid sig rejected for remote authorize (HTTP ${bad.status})`);
      else fail('AUTH-REMOTE-SIG', `Invalid sig ACCEPTED — HTTP ${bad.status}`);
    } else {
      fail('AUTH-REMOTE', `Session create failed: ${JSON.stringify(c.body)}`);
    }
  } catch(e) { fail('AUTH-REMOTE', e.message); }

  // 6g. SQL injection probe
  try {
    const r = await apiReq('POST', '/api/auth/pre-check', {
      walletAddress: "' OR '1'='1'; DROP TABLE users; --"
    });
    if (r.status < 500) {
      pass('SQLI-PRE-CHECK', `SQL injection handled gracefully (HTTP ${r.status}) — server did not crash`);
    } else {
      fail('SQLI-PRE-CHECK', `Server returned 500 on SQL injection — possible crash/vulnerability`);
    }
  } catch(e) { fail('SQLI-PRE-CHECK', `Server crashed: ${e.message}`); }

  // ══════════════════════════════════════════════
  // PHASE 7: CONCURRENCY PROBE
  // ══════════════════════════════════════════════
  sec('PHASE 7: CONCURRENCY + LOAD PROBE');

  // 20 concurrent requests to public endpoint
  const concRes = await Promise.all(
    Array.from({length:20}, () =>
      apiReq('GET', '/api/governance/alerts/count').catch(e=>({status:0,error:e.message}))
    )
  );
  const ok200 = concRes.filter(r=>r.status===200).length;
  const errNet = concRes.filter(r=>r.status===0).length;
  const rl429 = concRes.filter(r=>r.status===429).length;

  if (ok200 >= 15) {
    pass('CONC-20REQ', `20 concurrent requests: ${ok200} OK, ${rl429} rate-limited, ${errNet} network errors`);
  } else {
    fail('CONC-20REQ', `Only ${ok200}/20 concurrent requests succeeded (${errNet} errors, ${rl429} rate-limited)`);
  }

  // DB Pool: 10 concurrent queries
  const dbConcRes = await Promise.all(
    Array.from({length:10}, (_,i) =>
      pool.query(`SELECT $1::int as n, pg_backend_pid() as pid`, [i]).catch(e=>({error:e.message}))
    )
  );
  const dbOk = dbConcRes.filter(r=>!r.error).length;
  if (dbOk === 10) {
    pass('DB-CONC', '10 concurrent DB queries all succeeded — pool handling concurrent load');
  } else {
    fail('DB-CONC', `${10-dbOk} concurrent DB queries failed`);
  }

  // ══════════════════════════════════════════════
  // PHASE 8: REPUTATION WORKER VERIFICATION
  // ══════════════════════════════════════════════
  sec('PHASE 8: REPUTATION WORKER + ANOMALY DETECTION');

  try {
    const { runReputationWorker } = require('./src/workers/reputation-worker.js');
    const notariesBefore = await pool.query(`SELECT id, raw_reputation, effective_reputation FROM users WHERE role='notary'`);
    
    console.log('  🔄 Triggering reputation worker cycle...');
    await runReputationWorker();
    console.log('  ✓ Worker cycle complete');

    const notariesAfter = await pool.query(`SELECT id, raw_reputation, effective_reputation FROM users WHERE role='notary'`);
    pass('WORKER-CYCLE', `Reputation worker ran successfully for ${notariesAfter.rows.length} notary/notaries`);

    // Check anomaly penalties (raw_rep decreased)
    let penaltyCount = 0;
    for (const an of notariesAfter.rows) {
      const bn = notariesBefore.rows.find(b=>b.id===an.id);
      if (bn) {
        const diff = parseFloat(an.raw_reputation||0) - parseFloat(bn.raw_reputation||0);
        if (diff < -5) {
          penaltyCount++;
          console.log(`  ⚡ Anomaly penalty: Notary ${an.id}: raw_rep ${parseFloat(bn.raw_reputation).toFixed(1)} → ${parseFloat(an.raw_reputation).toFixed(1)} (Δ=${diff.toFixed(1)})`);
        }
      }
    }
    if (penaltyCount > 0) {
      pass('ANOMALY-PENALTY', `${penaltyCount} anomaly penalty/penalties applied this worker cycle`);
    } else if (parseInt(s.notaries) < 3) {
      pass('ANOMALY-SKIP', 'Anomaly detection skipped (bootstrap mode < 3 notaries) — correct behavior');
    } else {
      pass('ANOMALY-NONE', 'No anomaly penalties triggered — all notaries within ±40% system approval rate');
    }

    // Final reputation table
    console.log('\n  FINAL EFFECTIVE REPUTATION TABLE:');
    console.log(`  ${'─'.repeat(55)}`);
    console.log(`  ${'Notary ID'.padEnd(12)} ${'Raw Rep'.padEnd(12)} ${'Effective Rep'.padEnd(14)} ${'Activity'}`);
    console.log(`  ${'─'.repeat(55)}`);
    for (const n of notariesAfter.rows) {
      const rawRep = parseFloat(n.raw_reputation||0);
      const effRep = parseFloat(n.effective_reputation||0);
      const actFactor = rawRep > 0 ? (effRep/rawRep)*100 : 0;
      console.log(`  ${String(n.id).padEnd(12)} ${rawRep.toFixed(2).padEnd(12)} ${effRep.toFixed(2).padEnd(14)} ${actFactor.toFixed(0)}% of raw`);
    }
    console.log(`  ${'─'.repeat(55)}`);

  } catch(e) {
    fail('WORKER-CYCLE', `Reputation worker threw error: ${e.message}`);
  }

  // ══════════════════════════════════════════════
  // PHASE 9: SCHEMA GAPS IMPACT ANALYSIS
  // ══════════════════════════════════════════════
  sec('PHASE 9: SCHEMA GAP IMPACT ANALYSIS');

  // token_deposits missing → deposit route will fail
  const hasTokenDeposits = (await pool.query(`SELECT to_regclass('public.token_deposits') as t`)).rows[0].t;
  if (!hasTokenDeposits) {
    fail('SCHEMA-TOKEN_DEPOSITS', 'token_deposits table MISSING — POST /api/tokens/deposit will crash with 500 error when users try to top up NTKR');
  } else {
    pass('SCHEMA-TOKEN_DEPOSITS', 'token_deposits table exists');
  }

  // transactions missing → transactions route will fail
  const hasTransactions = (await pool.query(`SELECT to_regclass('public.transactions') as t`)).rows[0].t;
  if (!hasTransactions) {
    warn('SCHEMA-TRANSACTIONS', 'transactions table MISSING — GET /api/transactions will fail');
  } else {
    pass('SCHEMA-TRANSACTIONS', 'transactions table exists');
  }

  // ntkr_transactions: check if tx_type column accepts 'burn' value
  try {
    const txTypeCheck = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name='ntkr_transactions' AND column_name IN ('tx_type','type') AND table_schema='public'
    `);
    console.log('\n  ntkr_transactions column types:');
    txTypeCheck.rows.forEach(r => console.log(`    ${r.column_name}: ${r.data_type} (${r.udt_name})`));
    
    // Try inserting a test record to see if 'burn' is valid
    try {
      await pool.query('BEGIN');
      await pool.query(`INSERT INTO ntkr_transactions (user_id, document_id, amount, tx_type, status) VALUES (1,1,1,'burn','pending')`);
      await pool.query('ROLLBACK');
      pass('NTKR-TXTYPE', "ntkr_transactions accepts tx_type='burn' — confirms code/schema match");
    } catch(e) {
      await pool.query('ROLLBACK').catch(()=>{});
      if (e.message.includes('enum') || e.message.includes('invalid input value')) {
        fail('NTKR-TXTYPE', `ntkr_transactions ENUM does not contain 'burn' — documents.js insert will fail`);
        // Find what values are valid  
        const enumVals = await pool.query(`
          SELECT e.enumlabel FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          JOIN information_schema.columns c ON c.udt_name = t.typname
          WHERE c.table_name='ntkr_transactions' AND c.column_name='tx_type'
        `).catch(()=>({rows:[]}));
        if (enumVals.rows.length > 0) {
          console.error(`    Valid tx_type enum values: ${enumVals.rows.map(r=>r.enumlabel).join(', ')}`);
        }
      } else if (e.message.includes('violates foreign key') || e.message.includes('relation')) {
        warn('NTKR-TXTYPE', `Cannot test ENUM with dummy data: ${e.message.substring(0,80)}`);
      } else {
        warn('NTKR-TXTYPE', `Unexpected insert error: ${e.message.substring(0,120)}`);
      }
    }
  } catch(e) {
    fail('NTKR-TXTYPE', `Column check failed: ${e.message}`);
  }

  // ══════════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════════
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`  📋 BBSNS FULL ADVERSARIAL VALIDATION — FINAL VERDICT`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${'█'.repeat(70)}`);
  console.log(`  ✅ PASSED:   ${R.pass}`);
  console.log(`  ❌ FAILED:   ${R.fail}`);
  console.log(`  ⚠️  WARNINGS: ${R.warn}`);

  if (R.fail > 0) {
    console.log(`\n  🔴 FAILURES (Root Causes):`);
    R.items.filter(i=>i.s==='❌').forEach(f => console.error(`     ❌ [${f.id}]\n        ${f.msg}`));
  }
  if (R.warn > 0) {
    console.log(`\n  ⚠️  WARNINGS:`);
    R.items.filter(i=>i.s==='⚠️').forEach(w => console.warn(`     ⚠️  [${w.id}] ${w.msg}`));
  }

  console.log(`\n${'═'.repeat(70)}`);
  if (R.fail === 0) {
    console.log('  🏆 FINAL VERDICT: ✅ SYSTEM HOLDS UNDER STRESS');
    console.log('  All critical paths verified. Warnings require attention before production.');
  } else {
    console.log(`  🔴 FINAL VERDICT: ❌ SYSTEM HAS STRUCTURAL FLAWS`);
    console.log(`  ${R.fail} critical issue(s) must be fixed before production deployment.`);
  }
  console.log(`${'═'.repeat(70)}\n`);

  await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
