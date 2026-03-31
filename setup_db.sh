#!/bin/bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
