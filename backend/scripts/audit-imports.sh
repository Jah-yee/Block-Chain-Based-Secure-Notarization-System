#!/bin/bash
# 🛡️ PRE-DEPLOY IMPORT AUDITOR
# Description: Enforces the "Zero-Runtime-Coupling" policy for migration tools.

set -e

echo "🔍 [AUDIT] Checking for illegal runtime imports of node-pg-migrate..."

# Search src/ for any mention of node-pg-migrate
ILLEGAL_IMPORTS=$(grep -r "node-pg-migrate" src/ || true)

if [ -n "$ILLEGAL_IMPORTS" ]; then
    echo "❌ CRITICAL: Illegal runtime import detected in src/:"
    echo "$ILLEGAL_IMPORTS"
    echo "👉 Policy: node-pg-migrate must only be used in scripts/ and package.json."
    exit 1
fi

echo "✅ [AUDIT_PASS] No illegal imports found in src/."
