#!/bin/bash
echo "🛡️ [STAGE 1] ARCHITECTURAL INTEGRITY PROOF"
COUNT=$(sudo -u postgres psql -d notarydb -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'documents', 'system_config');")
CLEAN_COUNT=$(echo $COUNT | xargs)

if [ "$CLEAN_COUNT" -ge "3" ]; then
    echo "✅ [PASS] System tables verified ($CLEAN_COUNT core tables found)."
else
    echo "❌ [FAIL] Missing core tables! Only $CLEAN_COUNT found. Database may be in partial state."
    sudo -u postgres psql -d notarydb -c "\dt"
fi

echo ""
echo "🌐 [STAGE 2] CONTRACT REALITY PROOF"
cd /home/ubuntu/backend
node scripts/verify-reality.js
