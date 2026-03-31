-- Migration: Add 'approval' to tx_type_enum for approval/rejection transactions

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'tx_type_enum' AND e.enumlabel = 'approval') THEN
        ALTER TYPE tx_type_enum ADD VALUE 'approval';
    END IF;
END $$;
