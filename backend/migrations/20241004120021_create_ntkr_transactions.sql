-- ==============================
-- Module 1: NTKR Transactions Table
-- ==============================

CREATE TABLE IF NOT EXISTS ntkr_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    document_id INT REFERENCES documents(id),
    tx_type VARCHAR(20) NOT NULL,        -- request / receive / burn
    amount NUMERIC(18,8) NOT NULL,
    tx_hash VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_ntkr_transactions_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_ntkr_transactions_updated_at ON ntkr_transactions;

CREATE TRIGGER update_ntkr_transactions_updated_at
BEFORE UPDATE ON ntkr_transactions
FOR EACH ROW
EXECUTE PROCEDURE update_ntkr_transactions_updated_at_column();
