#!/bin/bash
# 🧪 Test 2: Invalid Config Overwrite & Self-Healing
echo "🔴 [1/3] Manually Corrupting Database (Version 0 + Empty Snapshot)..."
sudo -u postgres psql -d notarydb -c "UPDATE system_config SET version = 0, config_snapshot = '{}' WHERE id = 1;"

echo "⚙️ [2/3] Running deploy:init to Trigger Self-Healing..."
cd /home/ubuntu/backend
npm run deploy:init

echo "🔍 [3/3] Verifying Correction..."
RESULT=$(curl -s http://localhost:5000/api/system/config)
if echo "$RESULT" | grep -q "\"config_version\":1" && echo "$RESULT" | grep -q "0x1A820"; then
    echo "✅ TEST 2 PASS: Configuration was successfully corrected and seeded."
    echo "📝 FINAL JSON: $RESULT"
else
    echo "❌ TEST 2 FAIL: Configuration remained corrupt or default."
    echo "📝 ACTUAL JSON: $RESULT"
    exit 1
fi
