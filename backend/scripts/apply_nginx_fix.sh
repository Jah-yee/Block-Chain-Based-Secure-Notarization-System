#!/bin/bash
set -e

# 1. Define NGINX configuration using a heredoc (immune to shell variables)
cat <<'EOF' > /tmp/bbsns.online
server {
    listen 80;
    server_name api.bbsns.online bbsns.online;
    
    # Enforce production-grade body limit (Matches backend document limit)
    client_max_body_size 25M;

    location / {

        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # TEMPORARY: Routing bbsns.online to backend until frontend is live
        add_header X-Routing-Status 'TEMPORARY_BACKEND_REDIRECT';
    }
}
EOF

# 2. Apply configuration
sudo mv /tmp/bbsns.online /etc/nginx/sites-available/bbsns.online
sudo ln -sf /etc/nginx/sites-available/bbsns.online /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Test and restart
sudo nginx -t && sudo systemctl restart nginx
echo "✅ NGINX HARDENING COMPLETE"
