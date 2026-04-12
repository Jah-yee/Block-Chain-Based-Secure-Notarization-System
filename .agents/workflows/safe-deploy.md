---
description: Safe Deployment Protocol (Local -> EC2)
---

// turbo-all
# BBSNS Safe Deploy Workflow

This workflow MUST be followed for every production deployment or service restart.

1. **Local Validation**: 
   - Run `npm start` locally.
   - Verify no console errors.
   - Test `/api/health`.

2. **Impact Analysis**:
   - Invoke `system-impact-check` skill.
   - Confirm no breaking changes to critical flows.

3. **Backup**:
   - If database changes or destructive actions are involved:
   - Invoke `safe-db-write` skill.

4. **Sync Files (scp)**:
   - Synchronize modified files to the production server.
   - `scp -i ".../bbsns-keys.pem" file.js ubuntu@13.203.121.127:/home/ubuntu/BBSNS/backend/src/...`

5. **Restart (pm2)**:
   - Issue the restart command.
   - `ssh -i ".../bbsns-keys.pem" ubuntu@13.203.121.127 "pm2 reload all"`

6. **Health Check**:
   - Check API responsiveness in production.
   - `curl https://api.bbsns.online/api/health`

7. **Flow Validation**:
   - Invoke `auth-middleware-validator` skill (on production if possible, or via staging data).
