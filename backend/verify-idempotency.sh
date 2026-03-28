#!/bin/bash
# 🧪 Test 3: Idempotency Check
cd /home/ubuntu/backend

echo "🔄 [1/3] First Run..."
npm run deploy:init

echo "🔄 [2/3] Second Run..."
npm run deploy:init

echo "🔄 [3/3] Third Run..."
npm run deploy:init

echo "🔍 Verifying Row Count in system_config..."
COUNT=$(sudo -u postgres psql -d notarydb -t -c "SELECT COUNT(*) FROM system_config;")
CLEAN_COUNT=$(echo $COUNT | xargs)

if [ "$CLEAN_COUNT" -eq "1" ]; then
    echo "✅ TEST 3 PASS: Database remains idempotent. Row count is exactly $CLEAN_COUNT."
else
    echo "❌ TEST 3 FAIL: Duplicate rows detected! Row count is $CLEAN_COUNT."
    exit 1
fi
