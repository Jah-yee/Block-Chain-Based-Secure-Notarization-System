# GitHub Issue Templates for Cloud Readiness

Please create the following issues in the repository:

## 1. [CLOUD-READY] Statelessness Verification: Replace Local File Storage with Cloud Storage
**Description**:
### Problem
The backend uses `multer.diskStorage` to save files to a local `uploads` directory.

### Why it breaks
In a load-balanced cloud environment, multiple instances will have separate `uploads` folders. If a user uploads to Instance A, Instance B (handling confirmation) will not see the file, resulting in 404 errors and broken notarization flows.

### Recommended Fix
Integrate AWS S3 or compatible object storage. Replace `multer.diskStorage` with `multer-s3` or a custom S3 upload utility.

---

## 2. [CLOUD-READY] Statelessness Verification: Replace In-Memory Rate Limiting with Distributed Store
**Description**:
### Problem
The `auth.js` route uses a local, in-memory `Map` for rate limiting.

### Why it breaks
Rate limits are not shared across instances, allowing attackers to bypass limits by cycling through different nodes.

### Recommended Fix
Implement a Redis-backed rate limiter (e.g., `rate-limit-redis`).

---

## 3. [CLOUD-READY] Configuration & Environment Isolation: Environment-Driven CORS Origins
**Description**:
### Problem
CORS origins are hardcoded in `app.js`.

### Why it breaks
Deployment to production domains will fail without manual code modifications to the CORS policy.

### Recommended Fix
Move CORS origins to a `CORS_ALLOWED_ORIGINS` environment variable.

---

## 4. [CLOUD-READY] Distributed Consistency: Add Distributed Locking for Background Workers
**Description**:
### Problem
`reputation-worker.js` and `identity-sync-worker.js` have no locking mechanisms.

### Why it breaks
Multiple worker instances will run simultaneously, causing duplicate blockchain transactions (wasting gas) and race conditions in the DB.

### Recommended Fix
Use distributed locking (e.g., Redis `redlock` or Postgres advisory locks).

---

## 5. [CLOUD-READY] External Dependency Reliability: Exponential Backoff for RPC Failures
**Description**:
### Problem
The system uses a 'Fail-Fast' approach at boot and lacks exponential backoff for transient RPC outages.

### Why it breaks
High risk of crash loops during minor provider downtime.

### Recommended Fix
Implement exponential backoff and jitter for RPC retries.
