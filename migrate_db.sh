#!/bin/bash
cd /home/ubuntu/backend/migrations
for f in $(ls -v *.sql); do
  echo "Applying migration: $f"
  PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d notarydb -f "$f" || exit 1
done
echo "SQL Migrations Applied Successfully."
