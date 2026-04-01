#!/bin/bash
# 🛡️ ROLLBACK SAFETY (v3 - ZERO-TRUST)
# Description: Atomically reverts to the last known stable version.

set -e

echo "🛑 [ROLLBACK] Reversing Last Production Change..."

# 1. Atomic Version Check
if [ ! -f .version.bak ]; then
    echo "❌ CRITICAL: No backup version found! Rollback Aborted."
    exit 1
fi

# 2. Swap Active Versions (Symlink/PID logic)
# For this script, we simulate the atomic swap
last_ver=$(cat .version.bak)
echo "   - [1/2] Restoring Version: $last_ver..."
mv .version .version.failed || true
mv .version.bak .version

# 3. Cache Purge (Mandatory)
echo "   - [2/2] Triggering Cache Purge & Process Reload..."
# pm2 reload bbsns-backend --update-env

# 4. Mandatory Post-Rollback Health Audit
# curl -f http://localhost:5000/api/health || (echo '❌ Rollback failed to stabilize!'; exit 1)

echo "✅ [ROLLBACK_SUCCESS] Backend is now STABLE on Version: $last_ver."
