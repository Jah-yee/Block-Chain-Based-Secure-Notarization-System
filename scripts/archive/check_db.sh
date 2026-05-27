#!/bin/bash
echo "--- governance_proposals ---"
sudo -u postgres psql -d notarydb -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'governance_proposals';"
echo "--- remote_gov_sessions ---"
sudo -u postgres psql -d notarydb -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'remote_gov_sessions';"
