CREATE TABLE IF NOT EXISTS notary_applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    license_number VARCHAR(100) NOT NULL,
    experience TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id) -- One active application per user
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notary_applications_updated_at ON notary_applications;
CREATE TRIGGER update_notary_applications_updated_at
BEFORE UPDATE ON notary_applications
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
