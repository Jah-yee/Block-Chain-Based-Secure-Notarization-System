
-- ==============================
-- Module 1: Users Table
-- Full initial migration for backend
-- ==============================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    wallet_address VARCHAR(100) UNIQUE,              -- public wallet
    national_id_hash TEXT,                            -- hashed national ID
    consent_timestamp TIMESTAMP,                      -- GDPR/consent
    role VARCHAR(20) DEFAULT 'user',                 -- user / notary
    notary_pin_hash TEXT,                             -- hashed PIN for notary approve/reject
    kyc_verified BOOLEAN DEFAULT FALSE,              -- true if KYC/liveness passed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
