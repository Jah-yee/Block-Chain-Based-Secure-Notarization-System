-- Migration: Add liveness verification fields to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS face_descriptor JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'pending';
