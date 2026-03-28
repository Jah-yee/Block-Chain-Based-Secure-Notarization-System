#!/bin/bash
# 🧪 Test 4: Cold Start Check
echo "🔥 [1/3] DROPPING DATABASE (Full Reset)..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS notarydb;"
sudo -u postgres psql -c "CREATE DATABASE notarydb;"

echo "⚙️ [2/3] Running deploy:init from Zero State..."
cd /home/ubuntu/backend
npm run deploy:init

echo "🔍 [3/3] Verifying Setup..."
RESULT=$(curl -s http://localhost:5000/api/system/config)
if echo "$RESULT" | grep -q "\"config_version\":1"; then
    echo "✅ TEST 4 PASS: System successfully performed a Cold Start setup."
    echo "📝 FINAL JSON: $RESULT"
else
    echo "❌ TEST 4 FAIL: Cold Start failed to initialize config."
    echo "📝 ACTUAL JSON: $RESULT"
    exit 1
fi
