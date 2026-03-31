#!/bin/bash
# BBSNS Security Validation: Dynamic Role Mapping Hardening (Final)
set -e

# --- STEP 1: GENERATE FRESH TOKENS ---
echo "Generating fresh validation tokens..."
cd /home/ubuntu/backend

# Fetch a REAL wallet address for an existing owner (ID 8 or similar)
OWNER_WALLET=$(sudo -u postgres psql -d notarydb -t -c "SELECT wallet_address FROM users WHERE id = 8;" | xargs)
GUEST_WALLET="0x0000000000000000000000000000000000000000"

TOKEN_JSON=$(node -e "
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });
const snapshotBlock = 30000000;
const snapshotChainId = Number(process.env.CHAIN_ID) || 97;
const sign = (id, address, role) => jwt.sign(
  { id, address, role, snapshotBlock, snapshotChainId, issuedAt: Date.now() },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
console.log(JSON.stringify({
  GUEST: sign(99, '$GUEST_WALLET', 0),
  OWNER: sign(8, '$OWNER_WALLET', 1)
}));
")

GUEST_TOKEN=$(echo $TOKEN_JSON | jq -r '.GUEST')
OWNER_TOKEN=$(echo $TOKEN_JSON | jq -r '.OWNER')

API_URL='http://localhost:5000'
echo "BBSNS Security Validation Payload" > /tmp/security_test.txt

echo -e "\n--- SECURITY VALIDATION: ROLE MAPPING ---"

# TEST 1: Role 0 (NONE) accessing /initiate
echo "TEST 1: Role 0 (NONE) accessing /initiate..."
RES1=$(curl -s -X POST -H "Authorization: Bearer $GUEST_TOKEN" \
    -F "title=Security Test" \
    -F "category=1" \
    -F "file=@/tmp/security_test.txt" \
    $API_URL/api/documents/initiate)
echo "Response: $RES1"
MSG1=$(echo $RES1 | jq -r '.error')
if [[ "$MSG1" == *"Insufficient privileges"* ]]; then
    echo "RESULT 1: PASS (Access Blocked)"
else
    echo "RESULT 1: FAIL (Access Leak)"
fi

# TEST 2: Role 1 (OWNER) accessing /initiate
echo -e "\nTEST 2: Role 1 (OWNER) accessing /initiate..."
RES2=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" \
    -F "title=Security Test" \
    -F "category=1" \
    -F "file=@/tmp/security_test.txt" \
    $API_URL/api/documents/initiate)
echo "Response: $RES2"
ID2=$(echo $RES2 | jq -r '.intent_id // empty')
if [[ ! -z "$ID2" ]]; then
    echo "RESULT 2: PASS (Access Granted)"
else
    echo "RESULT 2: FAIL (Access Error: $RES2)"
fi

echo -e "\n--- VALIDATION COMPLETE ---"
