-- Add name column if not exists and enforce constraints on email and wallet_address
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS name VARCHAR(150);

ALTER TABLE users
    ALTER COLUMN email SET NOT NULL,
    ALTER COLUMN wallet_address SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'unique_email') THEN
        ALTER TABLE users ADD CONSTRAINT unique_email UNIQUE (email);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'unique_wallet') THEN
        ALTER TABLE users ADD CONSTRAINT unique_wallet UNIQUE (wallet_address);
    END IF;
END$$;
