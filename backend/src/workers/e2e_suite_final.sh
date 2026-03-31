#!/bin/bash
# BBSNS E2E Attack Testing Suite (Comprehensive)
set -e

OWNER_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OCwiYWRkcmVzcyI6IjB4MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBkZWFkIiwicm9sZSI6MSwic25hcHNob3RCbG9jayI6MzAwMDAwMDAsInNuYXBzaG90Q2hhaW5JZCI6OTcsImlzc3VlZEF0IjoxNzc0NzkyNTgyNzgyLCJleHAiOjE3NzQ3OTYxODJ9.lwqTTQZY8yfadgftl-0Mwq_kO70wxOEs2xoUtSLSUGc'
NOTARY_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OSwiYWRkcmVzcyI6IjB4MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsInJvbGUiOjIsInNuYXBzaG90QmxvY2siOjMwMDAwMDAwLCJzbmFwc2hvdENoYWluSWQiOjk3LCJpc3N1ZWRBdCI6MTc3NDc5MjU4Mjc4Miwic2lnbmF0dXJlIjoiYXV0aGVudGljX3Rlc3Rfc2lnIn0.v5w-X1W0H1N0N'
API_URL='http://localhost:5000'

# Create a test file
echo "BBSNS E2E Test Payload" > /tmp/e2e_test.txt

function verify_db {
    sudo -u postgres psql -d notarydb -t -c "$1" | xargs
}

echo -e "\n--- BBSNS E2E ATTACK SUITE ---"

# --- TEST 2 (VALIDATION) ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $OWNER_TOKEN" $API_URL/api/system/config)
[ "$STATUS" == "200" ] && echo "Step 2: PASS" || (echo "Step 2: FAIL ($STATUS)"; exit 1)

# --- TEST 1: ORPHAN UPLOAD ---
INIT_RES=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" -F "title=Orphan" -F "category=1" -F "file=@/tmp/e2e_test.txt" $API_URL/api/documents/initiate)
ID1=$(echo $INIT_RES | jq -r '.intent_id')
SK1=$(echo $INIT_RES | jq -r '.storage_key')
sudo -u postgres psql -d notarydb -c "UPDATE upload_intents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = '$ID1';" > /dev/null
node /home/ubuntu/backend/src/workers/cleanupWorker.js > /dev/null
STATE1=$(verify_db "SELECT status FROM upload_intents WHERE id = '$ID1'")
[ "$STATE1" == "expired" ] && [ ! -f "/home/ubuntu/backend/uploads/$SK1" ] && echo "Test 1: PASS" || echo "Test 1: FAIL"

# --- TEST 2: PREMATURE DELETION ---
INIT_RES2=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" -F "title=Guard" -F "category=1" -F "file=@/tmp/e2e_test.txt" $API_URL/api/documents/initiate)
SK2=$(echo $INIT_RES2 | jq -r '.storage_key')
[ -f "/home/ubuntu/backend/uploads/$SK2" ] && echo "Test 2: PASS" || echo "Test 2: FAIL"

# --- TEST 3: BLOCKCHAIN FAILURE SAFETY ---
ID3=$(echo $INIT_RES2 | jq -r '.intent_id')
curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" -H "Content-Type: application/json" -d "{\"intent_id\":\"$ID3\", \"txHash\":\"0xdead\"}" $API_URL/api/documents/confirm > /dev/null
NC3=$(verify_db "SELECT needs_cleanup FROM documents WHERE id = (SELECT document_id FROM upload_intents WHERE id = '$ID3')")
# needs_cleanup should be false because the confirmation failed
[ "$NC3" == "f" ] && echo "Test 3: PASS" || echo "Test 3: FAIL (needs_cleanup=$NC3)"

# --- TEST 4: SUCCESSFUL FLOW ---
# Manually push a document to 'needs_cleanup = true' to verify worker finalization
DOC_ID=$(verify_db "SELECT document_id FROM upload_intents WHERE id = '$ID3'")
sudo -u postgres psql -d notarydb -c "UPDATE documents SET needs_cleanup = true, status = 'APPROVED', blockchain_status = 'SUCCESS' WHERE id = '$DOC_ID';" > /dev/null
node /home/ubuntu/backend/src/workers/cleanupWorker.js > /dev/null
NC4=$(verify_db "SELECT needs_cleanup FROM documents WHERE id = '$DOC_ID'")
[ "$NC4" == "f" ] && [ ! -f "/home/ubuntu/backend/uploads/$SK2" ] && echo "Test 4: PASS" || echo "Test 4: FAIL"

# --- TEST 5: RATE LIMIT ---
for i in {1..10}; do curl -s -o /dev/null $API_URL/api/system/config; done
L5=$(verify_db "SELECT count(*) FROM rate_limits WHERE key LIKE '%127.0.0.1%'")
[ "$L5" -gt 0 ] && echo "Test 5: PASS" || echo "Test 5: FAIL"

# --- TEST 6: WORKER RECOVERY ---
pm2 stop cleanup-worker > /dev/null
INIT_RES6=$(curl -s -X POST -H "Authorization: Bearer $OWNER_TOKEN" -F "title=Recovery" -F "category=1" -F "file=@/tmp/e2e_test.txt" $API_URL/api/documents/initiate)
ID6=$(echo $INIT_RES6 | jq -r '.intent_id')
SK6=$(echo $INIT_RES6 | jq -r '.storage_key')
sudo -u postgres psql -d notarydb -c "UPDATE upload_intents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = '$ID6';" > /dev/null
pm2 start cleanup-worker > /dev/null
sleep 2
STATE6=$(verify_db "SELECT status FROM upload_intents WHERE id = '$ID6'")
[ "$STATE6" == "expired" ] && [ ! -f "/home/ubuntu/backend/uploads/$SK6" ] && echo "Test 6: PASS" || echo "Test 6: FAIL"

# --- TEST 7: LOCK SAFETY ---
# Ensure PM2 worker is active
pm2 restart cleanup-worker > /dev/null
node /home/ubuntu/backend/src/workers/cleanupWorker.js 2>&1 | grep "SKIP: Another instance running" && echo "Test 7: PASS" || echo "Test 7: FAIL"

echo -e "\n--- E2E SUITE COMPLETED ---"
