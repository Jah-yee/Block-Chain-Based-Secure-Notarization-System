const pool = require('./src/db/index');

async function applyMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Applying enum additions...');

        // PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE directly in some versions easily,
        // so we use a DO block to check manually.
        await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'add_admin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'proposal_type')) THEN
          ALTER TYPE proposal_type ADD VALUE 'add_admin';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'remove_admin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'proposal_type')) THEN
          ALTER TYPE proposal_type ADD VALUE 'remove_admin';
        END IF;
      END $$;
    `);

        await client.query('COMMIT');
        console.log('Migrations applied successfully!');
        process.exit(0);
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        if (client) client.release();
    }
}

applyMigrations();
