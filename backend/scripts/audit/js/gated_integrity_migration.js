const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    console.log('--- STARTING GATED INTEGRITY MIGRATION ---');
    const client = await pool.connect();
    try {
        // 0. Update Enum (OUTSIDE Transaction)
        console.log('- Expanding document_status_enum...');
        await client.query("ALTER TYPE document_status_enum ADD VALUE IF NOT EXISTS 'submitted_to_blockchain'");
    } catch (err) {
        // Ignore if error is 'already exists' or similar but keep going
        console.log('  (Enum update note: ' + err.message + ')');
    }

    try {
        await client.query('BEGIN');

        // 1. Create Blockchain Receipts (Proof Table)
        console.log('- Creating blockchain_receipts table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS blockchain_receipts (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER NOT NULL REFERENCES documents(id) UNIQUE,
                tx_hash TEXT NOT NULL UNIQUE,
                signer TEXT NOT NULL,
                doc_hash TEXT NOT NULL,
                contract_address TEXT NOT NULL,
                verified_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Modify Documents Table Structure
        console.log('- Hardening documents table schema...');
        await client.query(`
            -- Add chain_confirmed if not exists
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS chain_confirmed BOOLEAN DEFAULT false;
            
            -- Rename status to submission_state if not already renamed
            DO $$ 
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='status') THEN
                    ALTER TABLE documents RENAME COLUMN status TO submission_state;
                END IF;
            END $$;

            -- Update submission_state to 'submitted_to_blockchain' for legacy 'approved' docs
            UPDATE documents SET submission_state = 'submitted_to_blockchain' WHERE submission_state = 'approved';
        `);

        // 3. Drop legacy constraints
        console.log('- Cleaning legacy constraints...');
        await client.query(`
            ALTER TABLE documents DROP CONSTRAINT IF EXISTS enforce_tx_on_approval;
        `);

        // 4. Create Semantic Gated Integrity Trigger
        console.log('- Creating Semantic Confirmation Trigger...');
        await client.query(`
            CREATE OR REPLACE FUNCTION verify_document_confirmation()
            RETURNS TRIGGER AS $$
            DECLARE
                receipt_exists BOOLEAN;
            BEGIN
                -- 1. ONLY the 'worker_role' (or a trusted session flag for simulation) can set chain_confirmed to true
                -- For this environment, we check for a trusted worker session variable
                -- In a production hardened DB, we would check CURRENT_USER
                IF NEW.chain_confirmed = true AND OLD.chain_confirmed = false THEN
                    IF current_setting('app.is_trusted_worker', true) != 'true' THEN
                        RAISE EXCEPTION 'Unauthorized: Only the Reconciliation Worker can confirm document integrity.';
                    END IF;

                    -- 2. Validate Semantic Linkage
                    SELECT EXISTS (
                        SELECT 1 FROM blockchain_receipts 
                        WHERE doc_id = NEW.id 
                        AND doc_hash = NEW.file_hash
                        AND tx_hash = NEW.approval_tx_hash
                    ) INTO receipt_exists;

                    IF NOT receipt_exists THEN
                        RAISE EXCEPTION 'Integrity Failure: No matching cryptographic proof found in blockchain_receipts for doc_id=%', NEW.id;
                    END IF;
                END IF;

                -- 3. Immutability Enforcement
                IF OLD.chain_confirmed = true THEN
                    IF (NEW.file_hash != OLD.file_hash OR 
                        NEW.approval_tx_hash != OLD.approval_tx_hash OR 
                        NEW.user_id != OLD.user_id OR 
                        NEW.is_deleted != OLD.is_deleted) THEN
                        RAISE EXCEPTION 'Immutability Violation: Confirmed documents cannot be modified.';
                    END IF;
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_verify_confirmation ON documents;
            CREATE TRIGGER trg_verify_confirmation
            BEFORE UPDATE ON documents
            FOR EACH ROW
            EXECUTE FUNCTION verify_document_confirmation();
        `);

        await client.query('COMMIT');
        console.log('--- GATED INTEGRITY MIGRATION SUCCESSFUL ---');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
