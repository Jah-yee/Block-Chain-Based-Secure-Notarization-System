#!/bin/bash
# 🚀 BBSNS Web-App Production Setup Script
# Target: Ubuntu 22.04 LTS (EC2 Deployment)

PUBLIC_IP="13.233.236.240"
BACKEND_URL="http://$PUBLIC_IP:5000"

echo "🎨 [1/5] Configuring Environment Variables..."
# Update/Create .env.local with the correct PUBLIC API URL
cat <<EOF > .env.local
# AUTHENTICATED SYSTEM AUTHORITY 🛡️
# This application is now driven by the Backend Configuration Authority on EC2.
NEXT_PUBLIC_API_URL=$BACKEND_URL
EOF

echo "📦 [2/5] Installing Dependencies..."
npm install

echo "🏗️ [3/5] Building Production Bundle..."
# Next.js build requires NEXT_PUBLIC vars at build time
export NEXT_PUBLIC_API_URL=$BACKEND_URL
npm run build

echo "🚀 [4/5] Starting Web-App with Persistence (PM2)..."
sudo npm install -g pm2
pm2 delete bbsns-web > /dev/null 2>&1

# Start Next.js on port 3000, listening on all interfaces
pm2 start "npm run start -- -p 3000 -H 0.0.0.0" --name "bbsns-web"
pm2 save

echo "🔍 [5/5] Verifying Deployment..."
sleep 5
if curl -s http://localhost:3000 | grep -q "DOCTYPE html"; then
    echo "✅ SUCCESS: Web-App is responding locally on port 3000."
    echo "------------------------------------------------"
    echo "🌐 ACCESS URL: http://$PUBLIC_IP:3000"
    echo "⚠️  IMPORTANT: Ensure AWS Security Group allows Port 3000 Inbound!"
    echo "------------------------------------------------"
else
    echo "❌ ERROR: Web-App failed to start correctly."
    pm2 logs bbsns-web --lines 20
    exit 1
fi
