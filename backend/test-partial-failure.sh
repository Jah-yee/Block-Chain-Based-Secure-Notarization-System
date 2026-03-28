#!/bin/bash
# 🧪 Test 5: Partial Migration Failure
echo "💥 [1/3] Injecting Syntax Error into Migration: 20260124_create_auth_nonces.sql..."
FILE="/home/ubuntu/backend/migrations/20260124_create_auth_nonces.sql"
cp "$FILE" "${FILE}.bak"
echo "SYNTAX ERROR HERE;" >> "$FILE"

echo "⚙️ [2/3] Running deploy:init (Expecting Warning but Completion)..."
cd /home/ubuntu/backend
npm run deploy:init

echo "🔍 [3/3] Verifying Setup Integrity..."
RESULT=$(curl -s http://localhost:5000/api/system/config)
if echo "$RESULT" | grep -q "\"config_version\":1"; then
    echo "✅ TEST 5 PASS: System survived a partial migration failure and reached initialized state."
else
    echo "❌ TEST 5 FAIL: Partial failure blocked initialization."
    exit 1
fi

# Cleanup
mv "${FILE}.bak" "$FILE"
