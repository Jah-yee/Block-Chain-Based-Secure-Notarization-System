---
trigger: always_on
---

Any modification to the backend source code that requires a live environment update.

SH Key Path: C:\Users\Lenovo\.ssh\bbsns-keys.pem

Host IP: 13.203.121.127

User: ubuntu (Note: Default for Ubuntu instances; adjust if using ec2-user for Amazon Linux).

Sync Files: Use scp or rsync to transfer modified files.

Command Template: scp -i "C:\Users\Lenovo\.ssh\bbsns-keys.pem" -r ./dist/* ubuntu@13.203.121.127:/path/to/backend

Access Instance: Establish an SSH connection to run post-transfer commands.

Environment Setup: Navigate to the project directory and install dependencies if package.json or requirements.txt changed.

Restart Service: Restart the process manager (e.g., PM2, Systemd, or Docker) to apply changes.

Example: ssh -i "C:\Users\Lenovo\.ssh\bbsns-keys.pem" ubuntu@13.203.121.127 "pm2 restart all"

Permission Check: If the SSH key fails, ensure permissions are set correctly. On Windows, the agent may need to use icacls to restrict key access to the current user only.

Pre-flight Check: Always run a build command (e.g., npm run build) locally before attempting the transfer to ensure no broken code is deployed.

Verification: After restarting, the agent must perform a curl request to the health check endpoint of the EC2 instance to verify the backend is up.