# BBSNS Cloud Readiness Audit Report

**Status**: NOT READY FOR CLOUD DEPLOYMENT
**Overall Severity**: CRITICAL

---

## 1. Statelessness Verification: File Uploads
- **Target Area**: State / Storage
- **Scenario**: Multiple backend instances behind a load balancer. User uploads a document to Instance A; Notary attempts to view/approve via Instance B.
- **Expected Cloud Behavior**: Files should be stored in a shared, centrally accessible storage (e.g., AWS S3, Google Cloud Storage).
- **Actual Behavior**: Uses `multer.diskStorage` to save files to a local `uploads` directory.
- **Issue**: Yes
- **Severity**: Critical
- **Cloud Impact**: Notaries will see 404 errors when trying to access documents uploaded to a different instance. The system will effectively be "partitioned" by instance.
- **Recommended Fix**: Integrate AWS S3 or compatible object storage. Replace `multer.diskStorage` with `multer-s3` or a custom S3 upload utility.

## 2. Statelessness Verification: Rate Limiting
- **Target Area**: State / Security
- **Scenario**: User makes 5 rapid requests to `/api/auth/nonce`.
- **Expected Cloud Behavior**: Rate limits should be shared across all instances (e.g., via Redis).
- **Actual Behavior**: Uses a local, in-memory `Map` (`rateLimits`) inside `auth.js`.
- **Issue**: Yes
- **Severity**: Medium
- **Cloud Impact**: An attacker can bypass the intended rate limit by cycling through different backend instances. Security enforcement becomes inconsistent.
- **Recommended Fix**: Implement a Redis-backed rate limiter (e.g., `rate-limit-redis`).

## 3. Configuration & Environment Isolation: CORS
- **Target Area**: Config
- **Scenario**: Deploying the frontend and backend to a production domain (e.g., `bbsns.io`).
- **Expected Cloud Behavior**: Allowed origins should be fully environment-driven.
- **Actual Behavior**: Hardcoded `http://localhost:3000`, `http://127.0.0.1:3000`, etc., in `app.js`.
- **Issue**: Yes
- **Severity**: High
- **Cloud Impact**: Backend will block legitimate production frontend requests due to CORS policy mismatch unless code is manually changed before deployment.
- **Recommended Fix**: Move CORS origins to a `CORS_ALLOWED_ORIGINS` environment variable (comma-separated).

## 4. Distributed Consistency: Background Workers
- **Target Area**: Worker / DB / Blockchain
- **Scenario**: Two or more backend instances running simultaneously.
- **Expected Cloud Behavior**: Background tasks (Reputation, Identity Sync) should be coordinated to prevent duplicate processing.
- **Actual Behavior**: Both `reputation-worker.js` and `identity-sync-worker.js` run on a simple `setInterval`/`while(true)` loop with no locking.
- **Issue**: Yes
- **Severity**: Critical
- **Cloud Impact**: Multiple workers will attempt to process the same "FAILED_SYNC" users or recalculate reputations at the same time. This leads to redundant blockchain transactions (wasting gas), potential race conditions in the DB, and inconsistent reputation totals.
- **Recommended Fix**: Use a distributed locking mechanism (e.g., Redis `redlock` or Postgres `pg_advisory_lock`) to ensure only one worker instance runs at a time. Alternatively, use a job queue like `BullMQ`.

## 5. External Dependency Reliability: RPC Resilience
- **Target Area**: Blockchain
- **Scenario**: The configured BNB Testnet RPC node is temporarily down or slow.
- **Expected Cloud Behavior**: System should gracefully handle transient failures with retries and exponential backoff.
- **Actual Behavior**: `server.js` performs a "Fail-Fast" check at boot and exits if RPC is unreachable. `identity-sync-worker` retries every 60s but without backoff.
- **Issue**: Yes
- **Severity**: Medium
- **Cloud Impact**: System may enter a "crash loop" if the cloud provider restarts the pod while the RPC is experiencing a transient outage.
- **Recommended Fix**: Implement retry logic with exponential backoff in the provider initialization and worker loops.

## 6. Worker Isolation: Idempotency
- **Target Area**: Worker
- **Scenario**: Worker Instance A is slow; Worker Instance B starts.
- **Expected Cloud Behavior**: Tasks should be idempotent or locked.
- **Actual Behavior**: `identity-sync-worker` does not mark records as "in-progress" in a way that prevents another instance from picking them up simultaneously.
- **Issue**: Yes
- **Severity**: High
- **Cloud Impact**: Duplicate "triggerOnChainRegistration" calls.
- **Recommended Fix**: Use `UPDATE ... WHERE ... RETURNING` for atomic task claiming or a dedicated job state (e.g., `SYNCING`).

---

## Final Verdict: NOT READY

The BBSNS system is currently a **monolithic, stateful application** that assumes it runs on a single machine with a local filesystem. It lacks the coordination mechanisms required for high availability and horizontal scaling in a cloud environment.
