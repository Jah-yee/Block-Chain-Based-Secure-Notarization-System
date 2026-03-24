/**
 * BBSNS Targeted Diagnostics - Phase 2
 * Discovers actual backend port, schema gaps, and re-validates after findings
 */

const { Pool } = require('pg');
const http = require('http');
const net = require('net');

const DB_CONFIG = { connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' };

// ─── RESULT TRACKER ──────────────────────────────────────────────────────────
const R = { pass: 0, fail: 0, warn: 0, items: [] };
function pass(id, msg) { R.pass++; R.items.push({ s: '✅', id, msg }); console.log(`  ✅ ${id}: ${msg}`); }
function fail(id, msg) { R.fail++; R.items.push({ s: '❌', id, msg }); console.error(`  ❌ ${id}: ${msg}`); }
function warn(id, msg) { R.warn++; R.items.push({ s: '⚠️', id, msg }); console.warn(`  ⚠️  ${id}: ${msg}`); }
function section(n) { console.log(`\n${'═'.repeat(65)}\n  ${n}\n${'═'.repeat(65)}`); }

// HTTP helper
function apiReq(method, port, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port, path, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers }
    };
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

// Port checker
function isPortOpen(port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, 'localhost');
  });
}

async function main() {
  const pool = new Pool(DB_CONFIG);

  // ─── PHASE 1: FIND ACTUAL BACKEND PORT ─────────────────────────────────────
  section('PHASE 1: PORT DISCOVERY');
  
  const portsToCheck = [3000, 3001, 4000, 5000, 8000, 8080, 3002];
  let livePort = null;
  
  for (const p of portsToCheck) {
    const open = await isPortOpen(p);
    if (open) {
      try {
        const r = await apiReq('GET', p, '/');
        if (r.body && r.body.status === 'online') {
          pass(`PORT-${p}`, `Backend found and alive on port ${p} — DB time: ${r.body.serverTime}`);
          livePort = p;
          break;
        } else {
          warn(`PORT-${p}`, `Port ${p} open but not BBSNS backend (response: ${JSON.stringify(r.body).substring(0, 80)})`);
        }
      } catch(e) {
        warn(`PORT-${p}`, `Port ${p} open but HTTP failed: ${e.message}`);
      }
    }
  }
  
  if (!livePort) {
    fail('PORT', 'BBSNS Backend not found on any common port (3000,3001,4000,5000,8000,8080,3002)');
    console.error('\n  DIAGNOSIS: Backend may have crashed or is on an unexpected port.');
    console.error('  RECOMMENDATION: Check `npm start` output in backend/ terminal.\n');
  } else {
    console.log(`\n  Backend confirmed on PORT: ${livePort}`);
  }

  // ─── PHASE 2: SCHEMA DEEP AUDIT ────────────────────────────────────────────
  section('PHASE 2: DATABASE SCHEMA DEEP AUDIT');

  // 2a. All tables
  const tableRes = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
  `);
  const tables = tableRes.rows.map(r => r.table_name);
  console.log(`\n  Tables (${tables.length}): ${tables.join(', ')}\n`);

  // 2b. Users table column inventory
  const colRes = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name='users' AND table_schema='public' 
    ORDER BY ordinal_position
  `);
  console.log(`  USERS TABLE COLUMNS (${colRes.rows.length}):`);
  const userCols = {};
  colRes.rows.forEach(c => { 
    userCols[c.column_name] = c.data_type; 
    console.log(`    ${c.column_name.padEnd(25)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`);
  });

  // 2c. Check critical missing columns
  const criticalCols = {
    'users': ['id','wallet_address','role','raw_reputation','effective_reputation','ntkr_balance','kyc_verified','last_active_at'],
    'documents': ['id','user_id','notary_id','file_hash','submission_state','chain_confirmed','approval_tx_hash','is_deleted'],
    'reputation_events': ['id','user_id','event_type','score_delta','document_id'],
    'notary_applications': ['id','wallet_address','status','full_name','email']
  };

  for (const [table, cols] of Object.entries(criticalCols)) {
    if (!tables.includes(table)) {
      fail(`SCHEMA-${table}`, `Table '${table}' MISSING`);
      continue;
    }
    const tcRes = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name=$1 AND table_schema='public'`, [table]);
    const tcols = new Set(tcRes.rows.map(r => r.column_name));
    const missing = cols.filter(c => !tcols.has(c));
    if (missing.length === 0) {
      pass(`SCHEMA-${table}`, `All required columns present`);
    } else {
      fail(`SCHEMA-${table}`, `Missing columns: ${missing.join(', ')}`);
    }
  }

  // 2d. Optional tables
  const optTables = ['ntkr_transactions','token_deposits','transactions','remote_gov_sessions','disputes'];
  for (const t of optTables) {
    if (tables.includes(t)) {
      pass(`TABLE-${t}`, `Optional table '${t}' exists`);
      // Check structure
      if (t === 'ntkr_transactions') {
        const tc = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ntkr_transactions' AND table_schema='public'`);
        const tcols = tc.rows.map(r => r.column_name).join(', ');
        console.log(`    ntkr_transactions columns: ${tcols}`);
      }
    } else {
      warn(`TABLE-${t}`, `Optional table '${t}' MISSING`);
    }
  }

  // 2e. ENUM types
  const enumRes = await pool.query(`
    SELECT typname, array_agg(enumlabel ORDER BY enumsortorder) as vals
    FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    GROUP BY typname
  `);
  if (enumRes.rows.length > 0) {
    console.log(`\n  ENUM TYPES:`);
    enumRes.rows.forEach(e => console.log(`    ${e.typname}: ${e.vals.join(', ')}`));
  }

  // ─── PHASE 3: LIVE DATA STATE ─────────────────────────────────────────────
  section('PHASE 3: LIVE SYSTEM STATE');

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
      (SELECT COUNT(*) FROM reputation_events) as rep_events
  `);
  const s = stats.rows[0];
  console.log(`
  SYSTEM STATE:
  ┌─────────────────────────────────────────────┐
  │ Users:          ${String(s.total_users).padStart(6)}                          │
  │   - Admins:     ${String(s.admins).padStart(6)}                          │
  │   - Notaries:   ${String(s.notaries).padStart(6)}                          │
  │   - Owners:     ${String(s.owners).padStart(6)}                          │
  ├─────────────────────────────────────────────┤
  │ Documents (total): ${String(s.total_docs).padStart(6)}                       │
  │   - pending:       ${String(s.pending_docs).padStart(6)}                       │
  │   - assigned:      ${String(s.assigned_docs).padStart(6)}                       │
  │   - submitted:     ${String(s.submitted_docs).padStart(6)}                       │
  │   - confirmed:     ${String(s.confirmed_docs).padStart(6)}                       │
  │   - rejected:      ${String(s.rejected_docs).padStart(6)}                       │
  ├─────────────────────────────────────────────┤
  │ Notary Applications: ${String(s.applications).padStart(6)}                    │
  │ Governance Proposals:${String(s.proposals).padStart(6)}                    │
  │ Reputation Events:   ${String(s.rep_events).padStart(6)}                    │
  └─────────────────────────────────────────────┘`);

  // ─── PHASE 4: NOTARY + REPUTATION STATE ─────────────────────────────────
  section('PHASE 4: NOTARY & REPUTATION STATE');

  const notaries = await pool.query(`
    SELECT 
      u.id, u.wallet_address,
      COALESCE(u.name, u.email, 'unknown') as name,
      CAST(COALESCE(u.raw_reputation, 0) AS FLOAT) as raw_rep,
      CAST(COALESCE(u.effective_reputation, 0) AS FLOAT) as eff_rep,
      u.last_active_at,
      COUNT(d.id) as docs_assigned,
      COUNT(d.id) FILTER (WHERE d.submission_state='submitted_to_blockchain' OR d.chain_confirmed=true) as docs_completed,
      COALESCE(SUM(re.score_delta), 0) as computed_rep_sum,
      COUNT(re.id) as event_count
    FROM users u
    LEFT JOIN documents d ON d.notary_id = u.id AND d.is_deleted=false
    LEFT JOIN reputation_events re ON re.user_id = u.id
    WHERE u.role='notary'
    GROUP BY u.id, u.wallet_address, u.name, u.email, u.raw_reputation, u.effective_reputation, u.last_active_at
    ORDER BY raw_rep DESC
  `);

  if (notaries.rows.length === 0) {
    warn('NOTARY-STATE', 'No notaries in system yet');
  } else {
    console.log(`\n  ${'─'.repeat(100)}`);
    console.log(`  ${'ID'.padEnd(6)} ${'Raw Rep'.padEnd(10)} ${'Eff Rep'.padEnd(10)} ${'Docs'.padEnd(8)} ${'Completed'.padEnd(11)} ${'Events'.padEnd(8)} ${'Rep Sum'.padEnd(10)} ${'Wallet'.padEnd(20)}`);
    console.log(`  ${'─'.repeat(100)}`);
    
    let issueCount = 0;
    for (const n of notaries.rows) {
      const repDiff = Math.abs(n.raw_rep - parseFloat(n.computed_rep_sum));
      const consistent = repDiff <= 50; // Allow for anomaly penalties
      const marker = consistent ? '  ' : '❌';
      if (!consistent) issueCount++;
      
      console.log(`  ${marker}${String(n.id).padEnd(6)} ${n.raw_rep.toFixed(1).padEnd(10)} ${n.eff_rep.toFixed(1).padEnd(10)} ${String(n.docs_assigned).padEnd(8)} ${String(n.docs_completed).padEnd(11)} ${String(n.event_count).padEnd(8)} ${parseFloat(n.computed_rep_sum).toFixed(1).padEnd(10)} ${(n.wallet_address || '').substring(0,20)}`);
    }
    console.log(`  ${'─'.repeat(100)}`);
    
    if (issueCount === 0) {
      pass('NOTARY-REP', `All ${notaries.rows.length} notary reputation values within expected range`);
    } else {
      fail('NOTARY-REP', `${issueCount} notary/notaries have significant rep mismatch (stored vs computed)`);
    }
    
    // Assignment fairness check
    if (notaries.rows.length >= 3) {
      const sorted = [...notaries.rows].sort((a, b) => b.eff_rep - a.eff_rep);
      const highest = sorted[0];
      const lowest = sorted[sorted.length - 1];
      
      if (parseFloat(highest.docs_assigned) >= parseFloat(lowest.docs_assigned)) {
        pass('ASSIGN-FAIR', `Highest rep notary (${highest.raw_rep.toFixed(1)}, ${highest.docs_assigned} docs) ≥ lowest (${lowest.raw_rep.toFixed(1)}, ${lowest.docs_assigned} docs)`);
      } else {
        fail('ASSIGN-FAIR', `INVERTED: Lowest rep notary has MORE docs than highest rep`);
      }
    } else {
      warn('ASSIGN-FAIR', `Only ${notaries.rows.length} notary/notaries — bootstrap mode, cannot check weighted fairness (need ≥3)`);
    }
  }

  // ─── PHASE 5: DOCUMENT STATE INTEGRITY ─────────────────────────────────────
  section('PHASE 5: DOCUMENT STATE INTEGRITY');

  // 5a. Stuck documents
  const stuckDocs = await pool.query(`
    SELECT id, submission_state, notary_id, created_at, chain_confirmed 
    FROM documents 
    WHERE is_deleted=false AND submission_state='pending' AND notary_id IS NULL
    AND created_at < NOW() - INTERVAL '10 minutes'
  `);
  
  if (stuckDocs.rows.length === 0) {
    pass('DOC-STUCK', 'No documents stuck in pending without notary for >10 minutes');
  } else {
    fail('DOC-STUCK', `${stuckDocs.rows.length} document(s) stuck in 'pending' with no notary for >10 minutes`, 
      { ids: stuckDocs.rows.map(r => r.id) });
  }

  // 5b. Submission_state vs chain_confirmed consistency
  const stateConflict = await pool.query(`
    SELECT id, submission_state, chain_confirmed FROM documents 
    WHERE is_deleted=false AND (
      (chain_confirmed=true AND submission_state='pending') OR
      (chain_confirmed=true AND submission_state='assigned')
    )
  `);
  if (stateConflict.rows.length === 0) {
    pass('DOC-STATE', 'No submission_state/chain_confirmed conflicts');
  } else {
    fail('DOC-STATE', `${stateConflict.rows.length} documents have conflicting state (chain_confirmed=true but pending/assigned)`);
  }

  // 5c. Documents without NTKR cost recorded
  const missingNtkr = await pool.query(`
    SELECT COUNT(*) as cnt FROM documents WHERE is_deleted=false AND (ntkr_sent IS NULL OR ntkr_sent = 0)
  `);
  const mNtkr = parseInt(missingNtkr.rows[0].cnt);
  if (mNtkr === 0) {
    pass('DOC-NTKR', 'All documents have ntkr_sent recorded');
  } else {
    warn('DOC-NTKR', `${mNtkr} documents have ntkr_sent=0 or NULL (may indicate pre-NTKR uploads)`);
  }

  // ─── PHASE 6: AUTH TESTS (with correct port) ──────────────────────────────
  if (livePort) {
    section(`PHASE 6: AUTH SYSTEM TESTS (port ${livePort})`);

    // 6a. System status
    try {
      const r = await apiReq('GET', livePort, '/api/auth/system-status');
      if (r.status === 200) {
        pass('AUTH-SYS', `System status OK: activated=${r.body.activated}, adminCount=${r.body.adminCount}`);
        if (!r.body.activated) warn('AUTH-SYS', 'GenesisActivation NOT activated — onboarding window closed');
      } else {
        warn('AUTH-SYS', `System status HTTP ${r.status}: ${JSON.stringify(r.body)}`);
      }
    } catch(e) { fail('AUTH-SYS', `System status error: ${e.message}`); }

    // 6b. /auth/me silently returns null (not 401)
    try {
      const r = await apiReq('GET', livePort, '/api/auth/me');
      if (r.status === 200 && r.body.user === null) {
        pass('AUTH-ME', '/auth/me returns null for unauthenticated — Zero-Trust silent OK');
      } else if (r.status === 401) {
        fail('AUTH-ME', '/auth/me returns 401 for unauthenticated — should return null silently');
      } else {
        warn('AUTH-ME', `Unexpected /auth/me: ${r.status} ${JSON.stringify(r.body)}`);
      }
    } catch(e) { fail('AUTH-ME', `Error: ${e.message}`); }

    // 6c. Tampered JWT rejection
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTksImFkZHJlc3MiOiIweDAwMDEiLCJyb2xlIjozLCJpYXQiOjE3MDAwMDAwMDB9.BAD_SIG';
    try {
      const r = await apiReq('GET', livePort, '/api/documents', null, { 'Authorization': `Bearer ${fakeJwt}` });
      if (r.status === 401 || r.status === 403) {
        pass('AUTH-JWT', `Tampered JWT rejected (HTTP ${r.status})`);
      } else {
        fail('AUTH-JWT', `Tampered JWT ACCEPTED — HTTP ${r.status} — CRITICAL SECURITY ISSUE`);
      }
    } catch(e) { fail('AUTH-JWT', `Error: ${e.message}`); }

    // 6d. Invalid nonce login
    try {
      const r = await apiReq('POST', livePort, '/api/auth/login', {
        walletAddress: '0x0000000000000000000000000000000000000001',
        signature: '0x' + 'a'.repeat(130),
        signature_nonce: 'nonexistent-nonce-12345'
      });
      if (r.status >= 400) {
        pass('AUTH-NONCE', `Invalid nonce rejected (HTTP ${r.status}): ${r.body?.error}`);
      } else {
        fail('AUTH-NONCE', `Invalid nonce ACCEPTED — HTTP ${r.status}`);
      }
    } catch(e) { fail('AUTH-NONCE', `Error: ${e.message}`); }

    // 6e. Remote session lifecycle
    try {
      const create = await apiReq('POST', livePort, '/api/auth/remote/session', { device_id: 'diag-test-001' });
      if (create.status === 200 && create.body.sessionId) {
        const sid = create.body.sessionId;
        const status = await apiReq('GET', livePort, `/api/auth/remote/status/${sid}`);
        if (status.status === 200 && status.body.status === 'pending') {
          pass('AUTH-REMOTE', `Remote session lifecycle works: created sid=${sid}, status=pending`);
        } else {
          fail('AUTH-REMOTE', `Remote status poll failed: HTTP ${status.status}`);
        }
        
        // Test invalid sig
        const authAttempt = await apiReq('POST', livePort, '/api/auth/remote/authorize', {
          sessionId: sid, walletAddress: '0x01', signature: '0xbadsig'
        });
        if (authAttempt.status >= 400) {
          pass('AUTH-REMOTE-SIG', `Invalid signature rejected for remote authorize (HTTP ${authAttempt.status})`);
        } else {
          fail('AUTH-REMOTE-SIG', `Invalid signature ACCEPTED for remote auth — CRITICAL`);
        }
      } else {
        fail('AUTH-REMOTE', `Remote session creation failed: ${JSON.stringify(create.body)}`);
      }
    } catch(e) { fail('AUTH-REMOTE', `Error: ${e.message}`); }

    // 6f. Concurrent API probe (20 parallel requests)
    section('PHASE 7: CONCURRENCY + LOAD PROBE');
    
    const concurrentCalls = Array.from({length: 20}, () =>
      apiReq('GET', livePort, '/api/governance/alerts/count').catch(e => ({ error: e.message, status: 0 }))
    );
    const concResults = await Promise.all(concurrentCalls);
    const ok = concResults.filter(r => r.status === 200).length;
    const errors = concResults.filter(r => r.error).length;
    const rateLim = concResults.filter(r => r.status === 429).length;
    
    if (ok >= 15) {
      pass('CONC-LOAD', `20 concurrent requests: ${ok} OK, ${rateLim} rate-limited, ${errors} network errors`);
    } else {
      fail('CONC-LOAD', `Poor concurrency: only ${ok}/20 OK, ${errors} errors`);
    }

    // 6g. SQL injection probe
    try {
      const r = await apiReq('POST', livePort, '/api/auth/pre-check', {
        walletAddress: "' OR '1'='1'; DROP TABLE users; --"
      });
      // Should not crash server
      if (r.status < 500) {
        pass('SQLI', `SQL injection in wallet field handled gracefully (HTTP ${r.status}): server did not crash`);
      } else {
        fail('SQLI', `Server returned 500 on SQL injection attempt — possible vulnerability`);
      }
    } catch(e) { fail('SQLI', `Server crashed on injection: ${e.message}`); }
  }

  // ─── PHASE 8: REPUTATION RACE CONDITION ──────────────────────────────────
  section('PHASE 8: REPUTATION DUPLICATE EVENT GUARD');

  // Check if (document_id, event_type) has unique constraint
  const uniqueConstraints = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'reputation_events'::regclass
  `).catch(() => ({ rows: [] }));
  
  if (uniqueConstraints.rows.length > 0) {
    console.log('\n  Reputation Events Constraints:');
    uniqueConstraints.rows.forEach(c => console.log(`    ${c.conname}: ${c.def}`));
    const hasUnique = uniqueConstraints.rows.some(c => c.contype === 'u' || c.def.includes('document_id'));
    if (hasUnique) {
      pass('REP-UNIQUE', 'reputation_events has unique constraint protecting against duplicate events');
    } else {
      warn('REP-UNIQUE', 'No unique constraint on (document_id, event_type) — duplicate guard is SERVICE-LAYER only (handleEvent). A direct DB INSERT could bypass it.');
    }
  } else {
    warn('REP-UNIQUE', 'Could not read reputation_events constraints');
  }

  // Verify worker can be triggered without crashing
  try {
    const { runReputationWorker } = require('./src/workers/reputation-worker.js');
    console.log('\n  🔄 Triggering reputation worker...');
    await runReputationWorker();
    pass('WORKER-RUN', 'Reputation worker completed a cycle without crashing');
  } catch(e) {
    fail('WORKER-RUN', `Reputation worker threw: ${e.message}`);
  }

  // ─── FINAL REPORT ────────────────────────────────────────────────────────
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`  📋 BBSNS DIAGNOSTIC REPORT — FINAL VERDICT`);
  console.log(`${'█'.repeat(70)}`);
  console.log(`  ✅ Passed:   ${R.pass}`);
  console.log(`  ❌ Failed:   ${R.fail}`);
  console.log(`  ⚠️  Warnings: ${R.warn}`);

  const failures = R.items.filter(i => i.s === '❌');
  if (failures.length > 0) {
    console.log('\n  🔴 FAILURES:');
    failures.forEach(f => console.error(`     ❌ [${f.id}] ${f.msg}`));
  }

  const warnings = R.items.filter(i => i.s === '⚠️');
  if (warnings.length > 0) {
    console.log('\n  ⚠️  WARNINGS:');
    warnings.forEach(w => console.warn(`     ⚠️  [${w.id}] ${w.msg}`));
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  if (R.fail === 0) {
    console.log('  🏆 FINAL VERDICT: ✅ SYSTEM HOLDS UNDER STRESS');
  } else {
    console.log(`  🔴 FINAL VERDICT: ❌ SYSTEM HAS STRUCTURAL FLAWS (${R.fail} critical failures)`);
  }
  console.log(`${'═'.repeat(70)}\n`);

  await pool.end();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
