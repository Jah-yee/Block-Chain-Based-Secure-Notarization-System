#!/bin/bash
echo "🔥 [1/5] Resetting Database for Rollback Test..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS notarydb;"
sudo -u postgres psql -c "CREATE DATABASE notarydb;"

echo "⚙️ [2/5] Starting Initialization in background..."
cd /home/ubuntu/backend
# Start deploy:init and capture PID
npm run deploy:init > /tmp/init_output.log 2>&1 &
INIT_PID=$!
echo "📡 Process started with PID: $INIT_PID. Waiting for migrations to begin..."

# Wait 2 seconds (long enough for some tables to be created in the transaction)
sleep 2

echo "💥 [3/5] EXECUTING SIGKILL on PID $INIT_PID..."
kill -9 $INIT_PID

echo "🔍 [4/5] Checking Database State..."
# If atomicity works, there should be exactly 0 tables (excluding system tables)
TABLE_COUNT=$(sudo -u postgres psql -d notarydb -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
CLEAN_COUNT=$(echo $TABLE_COUNT | xargs)

echo "📊 [RESULT] Table Count after SIGKILL: $CLEAN_COUNT"

if [ "$CLEAN_COUNT" -eq "0" ]; then
    echo "✅ TEST 1 PASS: Atomic Rollback successful. Zero partial tables found."
else
    echo "❌ TEST 1 FAIL: Database is in a corrupted partial state ($CLEAN_COUNT tables found)."
    sudo -u postgres psql -d notarydb -c "\dt"
    exit 1
fi

echo "🔄 [5/5] Verifying Recovery (Next Run)..."
npm run deploy:init > /dev/null 2>&1
FINAL_COUNT=$(sudo -u postgres psql -d notarydb -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "🏁 Final Table Count after recovery: $FINAL_COUNT"
