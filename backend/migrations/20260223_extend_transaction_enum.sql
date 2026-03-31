-- Migration: 20260223_extend_transaction_enum.sql
-- Goal: Support the new transactional lifecycle statuses for NTKR transactions.

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'transaction_status_enum' AND e.enumlabel = 'submitted') THEN
        ALTER TYPE transaction_status_enum ADD VALUE 'submitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'transaction_status_enum' AND e.enumlabel = 'skipped') THEN
        ALTER TYPE transaction_status_enum ADD VALUE 'skipped';
    END IF;
END $$;
