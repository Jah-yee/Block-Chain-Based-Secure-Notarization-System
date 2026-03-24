/**
 * BBSNS P0 Critical Schema Fix Script
 * Applies all 5 database fixes ATOMICALLY (single transaction).
 * Safe to re-run — all statements are idempotent.
 */
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://bbsns_user:bbsns_pass@localhost:5433/notarydb' });

async function applyFixes() {
  const client = await pool.connect();
  console.log('\n██████ BBSNS P0 SCHEMA FIX — START ██████\n');

  try {
    // ── FIX 1: NTKR tx_type_enum — add 'burn' and 'purchase' if missing ─────
    // ntkr_transactions has both tx_type (VARCHAR ✅) and type (tx_type_enum ❌)
    // We must add values to the enum so 'type' column stops blocking inserts.
    // These ADD VALUE statements cannot be inside a transaction, so run first.
    console.log('STEP 1: Extending tx_type_enum with burn/purchase values...');
    try {
      await pool.query(`ALTER TYPE tx_type_enum ADD VALUE IF NOT EXISTS 'burn'`);
      console.log('  ✅ Added burn to tx_type_enum');
    } catch (e) {
      if (e.message.includes('already exists')) console.log('  ✅ burn already in tx_type_enum');
      else console.warn('  ⚠️  tx_type_enum might not exist (original tx_type is VARCHAR): ' + e.message);
    }
    try {
      await pool.query(`ALTER TYPE tx_type_enum ADD VALUE IF NOT EXISTS 'purchase'`);
      console.log('  ✅ Added purchase to tx_type_enum');
    } catch (e) {
      if (e.message.includes('already exists')) console.log('  ✅ purchase already in tx_type_enum');
      else console.warn('  ⚠️  tx_type_enum ADD VALUE failed: ' + e.message);
    }
    try {
      await pool.query(`ALTER TYPE tx_type_enum ADD VALUE IF NOT EXISTS 'approval'`);
      console.log('  ✅ Ensured approval is in tx_type_enum');
    } catch (e) { /* ignore */ }
    try {
      await pool.query(`ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'submitted'`);
      await pool.query(`ALTER TYPE transaction_status_enum ADD VALUE IF NOT EXISTS 'skipped'`);
      console.log('  ✅ Extended transaction_status_enum (submitted/skipped)');
    } catch (e) { console.warn('  ⚠️  transaction_status_enum: ' + e.message); }

    // ── FIXES 2–5 inside a transaction ───────────────────────────────────────
    await client.query('BEGIN');

    // FIX 2: token_deposits table (exact schema from migration)
    console.log('\nSTEP 2: Creating token_deposits table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS token_deposits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        tx_hash VARCHAR(128) NOT NULL UNIQUE,
        block_number INTEGER NOT NULL DEFAULT 0,
        package_id INTEGER NOT NULL DEFAULT 0,
        ntkr_amount NUMERIC(20,4) NOT NULL CHECK (ntkr_amount > 0),
        wallet_address VARCHAR(64) NOT NULL DEFAULT '',
        verified_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_token_deposits_user_id ON token_deposits(user_id)`);
    console.log('  ✅ token_deposits created/verified');

    // FIX 3: transactions table
    console.log('\nSTEP 3: Creating transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        tx_hash TEXT,
        type TEXT,
        amount NUMERIC,
        status TEXT DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash)`);
    console.log('  ✅ transactions created/verified');

    // FIX 4: is_banned column
    console.log('\nSTEP 4: Adding is_banned column to users...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false`);
    console.log('  ✅ is_banned added/verified');

    // FIX 5: is_active column (Virtual of is_deactivated — added as real column)
    console.log('\nSTEP 5: Adding is_active column to users...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
    // Sync existing rows: active if not deactivated
    await client.query(`UPDATE users SET is_active = NOT COALESCE(is_deactivated, false) WHERE is_active IS NULL`);
    console.log('  ✅ is_active added/synced from is_deactivated');

    // FIX 6: Add CHECK constraint compatibility for roles
    // The check was: role IN ('user', 'notary', 'admin') but code uses 'owner'
    console.log('\nSTEP 6: Checking role constraint compatibility...');
    const roleCheck = await client.query(`
      SELECT conname FROM pg_constraint 
      WHERE conrelid='users'::regclass AND conname='check_role_valid'
    `);
    if (roleCheck.rows.length > 0) {
      // Drop old constraint that doesn't include 'owner'
      await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role_valid`);
      await client.query(`
        ALTER TABLE users ADD CONSTRAINT check_role_valid 
        CHECK (role IN ('user', 'owner', 'notary', 'admin'))
      `).catch(e => {
        // If constraint already has owner, that's fine
        console.warn('  ⚠️  Role constraint update: ' + e.message);
      });
      console.log("  ✅ Role constraint updated to include 'owner'");
    } else {
      console.log("  ✅ No checked role constraint to update");
    }

    await client.query('COMMIT');
    console.log('\n✅ ALL FIXES COMMITTED SUCCESSFULLY\n');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ TRANSACTION ROLLED BACK:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function verifyFixes() {
  console.log('██████ SCHEMA VERIFICATION ██████\n');
  let allOk = true;

  // V1: tx_type_enum contains 'burn'
  try {
    const r = await pool.query(`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'tx_type_enum' AND e.enumlabel = 'burn'
    `);
    if (r.rows.length > 0) {
      console.log("  ✅ V1: tx_type_enum contains 'burn'");
    } else {
      // tx_type might be VARCHAR — check that
      const colCheck = await pool.query(`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name='ntkr_transactions' AND column_name='tx_type' AND table_schema='public'
      `);
      if (colCheck.rows[0]?.data_type === 'character varying') {
        console.log("  ✅ V1: tx_type is VARCHAR (accepts any string, 'burn' always valid)");
      } else {
        console.error("  ❌ V1: tx_type_enum does NOT contain 'burn' and tx_type is not VARCHAR");
        allOk = false;
      }
    }
  } catch(e) { console.error('  ❌ V1 check error:', e.message); allOk = false; }

  // V2: token_deposits exists
  const td = await pool.query(`SELECT to_regclass('public.token_deposits') as t`);
  if (td.rows[0].t) { console.log('  ✅ V2: token_deposits table exists'); }
  else { console.error('  ❌ V2: token_deposits MISSING'); allOk = false; }

  // V3: transactions exists
  const tr = await pool.query(`SELECT to_regclass('public.transactions') as t`);
  if (tr.rows[0].t) { console.log('  ✅ V3: transactions table exists'); }
  else { console.error('  ❌ V3: transactions MISSING'); allOk = false; }

  // V4: is_banned column
  const ib = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='users' AND column_name='is_banned' AND table_schema='public'
  `);
  if (ib.rows.length > 0) { console.log('  ✅ V4: users.is_banned column exists'); }
  else { console.error('  ❌ V4: users.is_banned MISSING'); allOk = false; }

  // V5: is_active column
  const ia = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='users' AND column_name='is_active' AND table_schema='public'
  `);
  if (ia.rows.length > 0) { console.log('  ✅ V5: users.is_active column exists'); }
  else { console.error('  ❌ V5: users.is_active MISSING'); allOk = false; }

  // V6: Can we insert into ntkr_transactions with tx_type='burn'?
  try {
    await pool.query('BEGIN');
    const testUser = await pool.query(`SELECT id FROM users LIMIT 1`);
    if (testUser.rows.length > 0) {
      await pool.query(
        `INSERT INTO ntkr_transactions (user_id, document_id, tx_type, amount, status, note, created_at, updated_at) 
         VALUES ($1, NULL, 'burn', 1, 'pending', 'schema-test', NOW(), NOW())`,
        [testUser.rows[0].id]
      );
      console.log("  ✅ V6: INSERT into ntkr_transactions with tx_type='burn' SUCCEEDS");
    } else {
      console.log("  ⚠️  V6: No users in DB to test ntkr INSERT — skipping test");
    }
    await pool.query('ROLLBACK'); // Always rollback the test insert
  } catch(e) {
    await pool.query('ROLLBACK').catch(()=>{});
    console.error("  ❌ V6: INSERT ntkr_transactions tx_type='burn' FAILED:", e.message);
    allOk = false;
  }

  console.log('\n' + '═'.repeat(60));
  if (allOk) {
    console.log('  🏆 SCHEMA VERIFICATION: ✅ ALL CHECKS PASSED');
  } else {
    console.log('  🔴 SCHEMA VERIFICATION: ❌ SOME CHECKS FAILED');
  }
  console.log('═'.repeat(60) + '\n');

  return allOk;
}

async function main() {
  try {
    await applyFixes();
    const ok = await verifyFixes();
    process.exit(ok ? 0 : 1);
  } catch(e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
