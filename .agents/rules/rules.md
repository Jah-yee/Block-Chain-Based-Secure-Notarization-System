---
trigger: always_on
---

# BBSNS Agent Operational Safety Rules

These rules are NON-NEGOTIABLE and MUST be evaluated before any skill, rule, or modification is performed within the BBSNS environment.

---

## 🧠 Ground Rule: Mandatory Multidimensional Impact Evaluation

Before performing any action, you MUST evaluate its impact on:
- **Owner flow** (Registration, Onboarding, Upload, Notarization)
- **Notary flow** (Login, Approval, Rejection)
- **Admin flow** (User Management, Governance)
- **Backend API** (Routes, Middleware, Services)
- **Database** (Schema, Triggers, Migrations)
- **Workers** (Reconciliation, Cleanup, Performance)
- **Blockchain** (Finality, Sync, Role Consistency)

**If no evaluation is performed → the operation is invalid.**

---

## 🛡️ 1. CRITICAL RULES (SYSTEM PROTECTION LAYER)

These rules are ALWAYS ENABLED.

### 🔴 RULE_1: SYSTEM IMPACT CHECK (MANDATORY)
**Purpose**: Prevent high-risk, "blind" changes.
**Rule**: Every change MUST include:
1. What it affects (list all system parts).
2. What can break (worst-case scenario).
3. Expected behavior after the change.
**If this evaluation is missing → STOP execution.**

### 🔴 RULE_2: NO DIRECT DB WRITE WITHOUT BACKUP
**Protects**: Entire system data and recovery integrity.
**Rule**: Before any `UPDATE`, `DELETE`, or `ALTER` query:
1. You MUST run: `pg_dump -t target_table > /home/ubuntu/backups/table_backup_$(date +%F).sql`
**Failure risk**: Irreversible data corruption or loss.

### 🔴 RULE_3: NO AUTH MIDDLEWARE CHANGE WITHOUT FLOW VALIDATION
**Targets**: `actor.js`.
**Rule**: Any change to `actor.js` MUST explicitly verify:
1. An Owner can access the Dashboard.
2. A Notary can access the Documents page.
3. An Admin can manage users via the Admin API.
**Failure risk**: Total system-wide lockout.

### 🔴 RULE_4: NO PRODUCTION DEPLOY WITHOUT LOCAL VALIDATION
**Rule**: Before executing a `pm2 restart` or `pm2 start` on the server:
1. The backend MUST be successfully run locally without runtime errors.
2. All critical routes (Login, Register) MUST be tested locally.
**Failure risk**: Production service crash or infinite restart loop.

### 🔴 RULE_5: STORAGE INTEGRITY RULE
**Rule**: Documents must NEVER be deleted after notarization unless explicitly moved to a documented archive state. S3 must NOT be used as temporary transit only.
**Failure risk**: Irreversible document loss.

### 🔴 RULE_6: IDENTITY INVARIANT
**Rule**: If a user's `identity_state` is set to `ACTIVE`, that user MUST have successful login access and full dashboard functionality. No background dependencies (like BC role sync) should block this.
**Failure risk**: Broken onboarding or "Infinite Loading" login states.

### 🔴 RULE_7: WORKER NON-BLOCKING RULE
**Rule**: Background workers (Reconciliation, Cleanup) must NEVER block or lock tables in a way that prevents the API from handling `login`, `dashboard`, or `upload` requests.
**Failure risk**: Hidden system deadlocks and total API unresponsiveness.

## 🔒 8. DEPLOYMENT INVARIANT
- **Verified Path Authority**: BEFORE any file transfer (`scp`) or service command (`pm2`), the active production directory MUST be verified by checking the `cwd` of the running process (`ps aux` or `pm2 info`).
- **Zero Pollution**: Never create new directories or redundant path variations (e.g., `BBSNS_v2`) on the production instance without explicit user instructions.
- **Fail-Safe Verify**: Every deployment MUST be followed by a health-check verification (`curl`) to the active backend endpoint.
