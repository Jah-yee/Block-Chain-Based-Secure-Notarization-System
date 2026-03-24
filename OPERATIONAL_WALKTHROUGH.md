# BBSNS Cloud Architecture Upgrade Walkthrough

This document summarizes the comprehensive transformation of the BBSNS platform into a **production-ready, horizontally scalable, and distributed system**.

## 🚀 Transformation Overview

The system has been upgraded from a stateful, single-instance architecture to a stateless, resilient distributed architecture across 6 critical phases.

---

## 🛠️ Phase-by-Phase Accomplishments

### Phase 1: Stateless S3 Storage
- **Cloud Migration**: Transitioned from local filesystem storage to **AWS S3**, enabling multiple backend instances to share the same document repository.
- **Memory Safety**: Implemented `multer.memoryStorage` with strict `MAX_FILE_SIZE` limits (externalized to `.env`) to prevent RAM exhaustion during high-concurrency uploads.
- **Atomic State Machine**: Files move through a deterministic lifecycle: `UPLOADED → STORED → NOTARIZED → DELETED`.
- **Compensating Cleanup**: Automatic deletion of S3 objects if database records fail to commit, preventing orphan data.

### Phase 2: Distributed Locking (Worker Coordination)
- **Postgres Advisory Locks**: Implemented [lock.service.js](file:///c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/services/lock.service.js) using `pg_try_advisory_lock` for lightweight, distributed coordination.
- **Exactly-Once Workers**: Guaranteed that background tasks (Reputation, Reconciliation, Sync) run on exactly one instance at a time without race conditions.

### Phase 3: Hardened Transaction Consistency
- **Exactly-Once Semantics**: Achieved "True Exactly-Once" execution for blockchain transactions using the **Atomic Claim + Intent** pattern.
- **Atomic Claiming**: Refactored workers to use a single SQL `UPDATE ... RETURNING *` to claim tasks, set `idempotency_key`, and record intent (`tx_status = 'initiated'`) simultaneously.
- **On-Chain Pre-flight**: Added mandatory blockchain state checks (e.g., `getDocument`, `getUserRole`) before any transaction is sent, providing a final defense against duplication.
- **Crash Recovery**: The [reconciliation-worker.js](file:///c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/workers/reconciliation-worker.js) now performs "blind verification" to settle stuck tasks even if `tx_hash` is missing.

### Phase 7: Actionable Operational Intelligence
The system is now fully monitorable and operable via structured JSON logs and real-time signals.
- **Strict Lifecycle Logging**: Every task transition logs `previous_state` and `new_state` for unambiguous auditing.
- **Performance Forensics**: Critical paths (TX send, confirmation) include high-precision `duration_ms` tracking.
- **Actionable Signals**: Critical events like `TASK_STUCK` or `RPC_FAILURE_SPIKE` trigger immediate escalation logs.
- **Worker Heartbeats**: Real-time backlog metrics (`pending`, `processing`, `failed`) are emitted every cycle.
- **Emergency Kill Switch**: Workers can be paused instantaneously via the `STOP_WORKERS` environment variable.

## Verification & Recovery Guide
### How to Trace a Transaction
1. Find the `correlation_id` in the API log or Database.
2. Grep logs for that ID to see the entire flow: `Claimed` -> `TX_Sent` -> `Confirmed`.
3. If `TX_FAILED` appears, check `error_type` and `error_stage` for immediate diagnosis.

### Recovery Procedures
- **Stuck Tasks**: The Reconciliation worker will automatically detect and signal `TASK_STUCK`. Use the `RECOVERY_TRIGGERED` event to confirm successful blind reconciliation.
- **RPC Spikes**: Check `RPC_FAILURE_SPIKE` signals to determine if a specific RPC provider is failing and update `BNB_RPC_URLS` accordingly.

### Phase 4: Configuration Externalization
- **Portability**: Purged all hardcoded URLs, CORS origins, and contract addresses.
- **Environment Driven**: The system is now fully configured via `.env`, supporting seamless transitions between Development, Staging, and Production.

### Phase 5: RPC Resilience
- **High Availability**: Refactored [connection.js](file:///c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/blockchain/connection.js) to support a list of fallback RPC nodes (`BNB_RPC_URLS`).
- **Resilient Connectivity**: Implemented **Exponential Backoff** initialization with automatic failover, ensuring the system remains operational during blockchain provider instability.

### Phase 6: Distributed Rate Limiting
- **Scalable Security**: Migrated in-memory rate limits to a **Postgres-backed distributed model** via [rate-limiter.js](file:///c:/Users/Lenovo/OneDrive/Desktop/Final_pro/BBSNS/backend/src/utils/rate-limiter.js).
- **Global Control**: Limits are now enforced system-wide across all backend instances, preventing distributed brute-force attacks.

---

## 🧪 System Verification

- [x] **Distributed Lock Test**: Parallel workers correctly skip already-locked tasks.
- [x] **Idempotency Stress Test**: Duplicate notarization attempts are caught by the `idempotency_key` UNIQUE constraint.
- [x] **RPC Failover Test**: System successfully connects even if the primary RPC is unreachable.
- [x] **Storage Integrity**: S3 files are correctly purged after on-chain confirmation.

## 🏁 Conclusion
The BBSNS backend is now **stateless**, **crash-safe**, and **horizontally scalable**. It is ready for deployment in high-availability cloud environments (AWS/GCP/Kubernetes).
