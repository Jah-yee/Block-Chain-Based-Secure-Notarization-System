# 🛡️ BBSNS: The Visual Technical Encyclopedia

**BBSNS (Block-Chain Based Secure Notarization System)** is an enterprise-grade decentralized infrastructure. This document provides a granular technical map of the protocol's engineering, security, and cryptographic foundations.

---

## 🏗️ 1. Global Ecosystem Blueprint
The relationship between Client applications, Cloud infrastructure, and the Blockchain source-of-truth.

```mermaid
graph TD
    subgraph "🌐 Frontend Layer"
        Web[Next.js Portal]
        Desktop[Electron Console]
    end
    subgraph "☁️ Application Layer"
        API[Node.js Orchestrator]
        Workers[Background Workers]
        S3[(AWS S3 Vault)]
    end
    subgraph "⛓️ Blockchain Layer"
        Registry[DocumentRegistry.sol]
        NTKR[NTKR.sol]
        MultiSig[BBSNSMultiSig.sol]
    end
    Web -->|Upload| API
    Desktop -->|Verify| API
    API -->|Signed URL| S3
    API -->|EIP-712 Relay| Registry
    Registry -->|Status| NTKR
```

---

## 📂 2. Document State Machine (Authoritative)
Tracking every document from initial intent to permanent on-chain finalization.

```mermaid
stateDiagram-v2
    [*] --> INTENT_CREATED: Initiate
    INTENT_CREATED --> INTENT_PAYMENT_PENDING: S3 Uploaded
    INTENT_PAYMENT_PENDING --> INTENT_PAYMENT_VERIFIED: NTKR Burn
    INTENT_PAYMENT_VERIFIED --> NOTARY_ASSIGNMENT_PENDING: DB Sync
    NOTARY_ASSIGNMENT_PENDING --> CHAIN_TX_PENDING: Notary Signature
    CHAIN_TX_PENDING --> CHAIN_TX_CONFIRMED: On-Chain Confirmed
    CHAIN_TX_CONFIRMED --> [*]
```

---

## 🔐 3. Forensic Identity Invariants
The normalization engine that prevents identity fraud and collision attacks.

```mermaid
graph LR
    A[Input ID] --> B(Trim)
    B --> C(Remove Spaces)
    C --> D(To Uppercase)
    D --> E{SHA-256 Hash}
    E --> F[Identity Invariant]
```

---

## 🖋️ 4. Cryptographic Bridge (EIP-712)
Step-by-step sequence of the gasless remote signing protocol.

```mermaid
sequenceDiagram
    participant D as Desktop App
    participant B as Backend API
    participant W as Remote Wallet
    participant BC as Blockchain
    D->>B: Request Payload
    B->>BC: Fetch Nonce
    BC-->>B: Nonce
    B-->>D: Payload (EIP-712)
    D->>W: Push Challenge
    W->>W: Sign (MetaMask)
    W->>B: Submit Signature
    B->>BC: relay(recordAction)
```

---

## 🏛️ 5. Multi-Sig Governance Chain
How the administrative committee manages protocol updates and roles.

```mermaid
graph TD
    A[Admin 1] -->|Propose| P(Proposal)
    B[Admin 2] -->|Sign| P
    C[Admin 3] -->|Sign| P
    P -->|Threshold Met| E{Execute}
    E -->|Update| Registry[NotaryRegistry.sol]
```

---

## 💸 6. The Upload-Payment Atomic Loop
The precise sequence ensuring files are paid for before becoming visible.

```mermaid
graph LR
    A[Client] -->|POST /initiate| B[API]
    B -->|Upload| S3[AWS S3]
    B -->|Intent ID| A
    A -->|burnForUpload| BC[Blockchain]
    BC -->|Event| API
    API -->|POST /confirm| D[DB: documents]
```

---

## 📊 7. Database Entity Architecture
The relational map connecting Users, Documents, and Blockchain Intents.

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : "owns"
    USERS ||--o{ UPLOAD_INTENTS : "initiates"
    DOCUMENTS ||--o{ NTKR_TRANSACTIONS : "logs"
    UPLOAD_INTENTS ||--|| DOCUMENTS : "finalizes"
```

---

## 🚀 8. Self-Healing Worker Lifecycle
The timing and triggers for the system's background resilience workers.

```mermaid
graph TD
    T[Timer] -->|Every 5m| Rec[Reconciliation Worker]
    T -->|Every 24h| Scav[Scavenger Worker]
    Rec -->|Check| BC[Blockchain State]
    Scav -->|Purge| S3[Orphaned Files]
```

---

## 🛡️ 9. Request Execution Trace
The multi-layer protection applied to every API request via `actor.js`.

```mermaid
graph TD
    R[Incoming Request] --> A[Token Firewall]
    A --> B[Role Normalization]
    B --> C[Environment Check]
    C --> D[Identity State Gate]
    D --> E{Logic Execution}
```

---

## 💎 10. The Tokenomics Flywheel
Incentive alignment between Document Owners (Users) and Officials (Notaries).

```mermaid
graph LR
    U[User] -->|Burn NTKR| BC[Blockchain]
    BC -->|Proof| N[Notary]
    N -->|Record Action| BC
    BC -->|Reward NTKR| N
```

---

## ☁️ 11. Secure Storage Hierarchy
Logical partitioning of the Encrypted S3 Vault for maximum isolation.

```mermaid
graph TD
    Root[/BBSNS-Bucket/] --> Intents[/intents/]
    Intents --> UserID[/{userId}/]
    UserID --> IntentID[/{intentId}/]
    IntentID --> FileID[/{fileId}.pdf]
```

---

## 🛑 12. Circuit Breaker Protocol
The system response to an emergency on-chain `pause()` command.

```mermaid
graph LR
    G[Governance] -->|pause| BC[Blockchain]
    BC -->|state=Paused| API[Backend]
    API -->|403 Forbidden| User[All Mutations]
```

---

## 📖 13. Deep Technical Documentation

### **Cryptographic Primitives**
- **Hashing**: SHA-256 for files, Keccak-256 for on-chain proof.
- **Signing**: EIP-712 (Typed Data) and EIP-191 (Personal Sign).
- **Communication**: TLS 1.3 (API) and WSS (Remote Auth).

### **Production Deployment Strategy**
1. **API**: Managed via PM2 with `max_memory_restart: 1G`.
2. **Database**: PostgreSQL with row-level security and `context-rebinder` audit trails.
3. **Storage**: AWS S3 with **Versioning** enabled to prevent accidental deletion.

---

**BBSNS: Authenticity through Cryptographic Finality.**
