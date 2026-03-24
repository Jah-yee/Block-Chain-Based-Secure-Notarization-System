const pool = require('../src/db/index.js');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("--- MIGRATING IDENTITY STATE ---");
    await client.query('BEGIN');

    // 1. Create ENUM type
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE identity_state AS ENUM (
          'PENDING_KYC', 
          'KYC_VERIFIED', 
          'ONCHAIN_PENDING', 
          'ACTIVE', 
          'FAILED_SYNC'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("✅ Created identity_state ENUM");

    // 2. Add column to users
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS identity_state identity_state 
      DEFAULT 'PENDING_KYC';
    `);
    console.log("✅ Added identity_state column to users");

    // 3. Transition existing admins to ACTIVE
    // We assume current admins are already verified and sync'd (verified in previous audit)
    const result = await client.query(`
      UPDATE users 
      SET identity_state = 'ACTIVE' 
      WHERE role IN ('admin', 'notary');
    `);
    console.log(`✅ Transitioned ${result.rowCount} existing Admin/Notary users to ACTIVE`);

    await client.query('COMMIT');
    console.log("--- MIGRATION COMPLETE ---");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
