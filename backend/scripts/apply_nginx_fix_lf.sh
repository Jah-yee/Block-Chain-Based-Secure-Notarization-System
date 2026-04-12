#!/bin/bash
set -e

# 1. Define NGINX configuration (Including SSL restoration)
cat <<'EOF' > /tmp/bbsns.online
server {
    listen 80;
    server_name api.bbsns.online bbsns.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl; 
    server_name api.bbsns.online bbsns.online;

    # Enforce production-grade body limit (Matches backend document limit)
    client_max_body_size 25M;

    # SSL Restoration (Authoritative Certs)
    ssl_certificate /etc/letsencrypt/live/bbsns.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bbsns.online/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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
echo '✅ NGINX HARDENING & SSL RESTORED'
