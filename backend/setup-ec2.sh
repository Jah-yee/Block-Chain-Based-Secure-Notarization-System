#!/bin/bash
# 🚀 BBSNS Phase 1 Automated EC2 Setup
# Target: Ubuntu 22.04 LTS

echo "🔄 [1/6] Updating System..."
sudo apt-get update -y && sudo apt-get upgrade -y

echo "📦 [2/6] Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "🐘 [3/6] Installing & Verifying PostgreSQL..."
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 🛡️ SECURE DB SETUP (STRICT HARDENING)
DB_PASS=$(openssl rand -base64 32)
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'bbsns_user') THEN CREATE USER bbsns_user WITH PASSWORD '${DB_PASS}'; END IF; END \$\$;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'notarydb'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE notarydb OWNER bbsns_user;"
sudo -u postgres psql -c "ALTER USER bbsns_user WITH SUPERUSER;"

# VERIFY DB CONNECTION
if ! sudo -u postgres psql -d notarydb -c "SELECT 1" > /dev/null 2>&1; then
    echo "❌ ERROR: Could not connect to PostgreSQL 'notarydb'."
    exit 1
fi
echo "✅ PostgreSQL is running and database is accessible."

echo "📂 [4/6] Preparing Backend Environment..."
if [ ! -f ".env.deployment" ]; then
    echo "❌ ERROR: .env.deployment missing! Please ensure you are in the backend directory."
    exit 1
fi
cp .env.deployment .env

echo "⚙️ [5/6] Installing Dependencies & Initializing DB..."
npm install
npm run deploy:init

echo "🚀 [6/6] Starting BBSNS Backend with Persistence (PM2)..."
sudo npm install -g pm2
pm2 delete bbsns-api > /dev/null 2>&1
pm2 start server.js --name "bbsns-api"
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME > /dev/null 2>&1

echo "🔍 [VERIFICATION] Stress-Testing Connection..."
sleep 5 # Wait for boot

if curl -s http://localhost:5000/api/system/config | grep -q "chainId"; then
    echo "✅ SUCCESS: Backend is responding correctly."
    echo "------------------------------------------------"
    echo "🚀 BBSNS IS LIVE AT: http://$(curl -s http://checkip.amazonaws.com):5000"
    echo "🔑 DATABASE PASSWORD: ${DB_PASS}"
    echo "👉 (ACTION REQUIRED): Add this to your local .env as DB_PASSWORD"
    echo "------------------------------------------------"
    echo "👉 Check logs anytime with: pm2 logs bbsns-api"
else
    echo "❌ FATAL ERROR: Backend service failed to respond on port 5000."
    echo "📄 LOG START (Last 50 lines):"
    pm2 logs bbsns-api --lines 50 --no-daemon & sleep 5 && kill $!
    exit 1
fi
