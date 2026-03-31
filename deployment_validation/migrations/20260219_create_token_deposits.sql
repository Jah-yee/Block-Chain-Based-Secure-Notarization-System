-- Token Deposits: Bridge between on-chain NTKR purchases and internal DB balance
-- Each row is a verified on-chain PackagePurchased event that has been credited to the user

CREATE TABLE IF NOT EXISTS token_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    tx_hash VARCHAR(128) NOT NULL UNIQUE,
    block_number INTEGER NOT NULL,
    package_id INTEGER NOT NULL,
    ntkr_amount NUMERIC(20,4) NOT NULL CHECK (ntkr_amount > 0),
    wallet_address VARCHAR(64) NOT NULL,
    verified_at TIMESTAMP DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_token_deposits_user_id ON token_deposits(user_id);
-- Index for tx_hash lookups (UNIQUE already creates one, but explicit for clarity)
