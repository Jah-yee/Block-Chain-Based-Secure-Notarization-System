-- BBSNS Forensic Schema Audit
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('wallet_nonces', 'users', 'remote_auth_sessions', 'documents') 
ORDER BY table_name, column_name;
