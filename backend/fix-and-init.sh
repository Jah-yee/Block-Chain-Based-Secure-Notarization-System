#!/bin/bash
echo "🩹 [REPAIR] Restoring Schema Consistency..."
sudo -u postgres psql -d notarydb -c "ALTER TABLE users_bak RENAME TO users;" 2>/dev/null || echo "⏭️  [INFO] users table already named correctly."

echo "🚀 [INIT] Running Hardened Initialization Flow..."
cd /home/ubuntu/backend
npm run deploy:init
