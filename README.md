# 🛡️ BBSNS: The Global Secure Notarization Protocol

**BBSNS (Block-Chain Based Secure Notarization System)** is a decentralized infrastructure designed to provide absolute cryptographic certainty for document authenticity. By combining local desktop security with global blockchain finality, BBSNS eliminates the risk of document tampering and centralized identity fraud.

---

## 🏛️ 1. High-Level System Architecture

BBSNS operates across three distinct domains to ensure maximum security and scalability.

```mermaid
graph TD
    subgraph "🌐 Client Domain"
        Web[Web Application - Next.js]
        Desktop[Desktop Application - Electron]
    end

    subgraph "☁️ Cloud Infrastructure"
        API[Backend API - Node.js]
        S3[Object Storage - AWS S3]
        DB[(PostgreSQL)]
    end

    subgraph "⛓️ Blockchain Layer"
        BC[BSC Testnet]
        Registry[Document Registry Contract]
        NTKR[NTKR Reputation Contract]
    end

    Web -->|Upload| API
    Desktop -->|Review| API
    API -->|Metadata| DB
    API -->|Signed URLs| S3
    API -->|Relay| Registry
    NTKR -->|BurnedForUpload| BC
```

### **The Technical Reality:**
- **NTKR Integration**: The system utilizes the **NTKR (Reputation Token)** contract for upload commitments. Users must trigger a `BurnedForUpload` event before the document enters the notary queue.
- **AWS S3 Lock**: Storage is strictly managed via AWS S3 with **Signed URL** generation for secure, temporary document access.
- **Stateless Orchestration**: The Backend API manages the bridge between cryptographic identity and permanent file storage.

---

## 📂 2. The Document Lifecycle (UX State Contract)

BBSNS uses a **State Perception Model** to track documents from intent to on-chain finality.

```mermaid
stateDiagram-v2
    [*] --> INTENT_CREATED: Initiate Upload
    INTENT_CREATED --> INTENT_PAYMENT_PENDING: File Uploaded to S3
    INTENT_PAYMENT_PENDING --> INTENT_PAYMENT_VERIFIED: BurnedForUpload (NTKR)
    INTENT_PAYMENT_VERIFIED --> NOTARY_ASSIGNMENT_PENDING: DB Sync
    NOTARY_ASSIGNMENT_PENDING --> CHAIN_TX_PENDING: Notary Signed
    CHAIN_TX_PENDING --> CHAIN_TX_CONFIRMED: Block Confirmation
    CHAIN_TX_CONFIRMED --> [*]
```

### **Authoritative States:**
- **INTENT_PAYMENT_PENDING**: The file is safe in S3, waiting for the blockchain commitment.
- **NOTARY_ASSIGNMENT_PENDING**: The document is visible in the Public Notary Pool for claiming.
- **CHAIN_TX_CONFIRMED**: The document hash and notary signature are permanently etched into the BSC Testnet.

---

## 🔐 3. Forensic Identity & Invariants

BBSNS implements a **Zero-Trust Identity Invariant** system that normalizes sensitive identifiers to prevent collision attacks.

```mermaid
graph LR
    A[Input: National ID] --> B(Normalization Engine)
    B --> C{Identity Invariant Check}
    C -->|Match| D[Access Granted]
    C -->|Mismatch| E[Access Denied]
    
    subgraph "Normalization Engine"
        B1[Trim Whitespace]
        B2[Remove All Spaces]
        B3[To Uppercase]
    end
```

### **Security Invariants:**
- **ID Normalization**: National IDs are processed through a `replace(/\s+/g, '').toUpperCase()` pipeline before hashing.
- **Identity State Gate**: Only users with `identity_state === 'ACTIVE'` can bypass the `requirePrivilege` middleware. **REJECTED** or **DEACTIVATED** states result in an immediate forensic lockout.

---

## 🖋️ 4. EIP-712 Remote Signing Bridge

The system utilizes **EIP-712 Typed Data Signing** to ensure that Notaries can verify the exact contents of the payload (Doc Hash, Owner Address, Status) before signing.

### **The Handshake Protocol:**
1. **Desktop App**: Requests an atomic signature payload from the Backend.
2. **Remote Auth Bridge**: Renders the document preview via a signed S3 URL.
3. **Wallet Signing**: The Notary signs the EIP-712 message.
4. **Relay**: The Backend submits the signature to the `recordAction` function on the `DocumentRegistry` contract.

---

## 🏛️ 5. Governance & Resilience

- **Multi-Sig Control**: Protocol updates are managed via a threshold-based governance model in the `NotaryRegistry` contract.
- **Self-Healing Workers**: 
    - **Reconciliation**: Heals the "Sync Gap" for documents confirmed on-chain but pending in the DB.
    - **Scavenger**: Purges orphaned S3 intents to maintain storage hygiene.
- **Circuit Breaker**: The `requireUnpaused` middleware can freeze all mutations during protocol upgrades.

---

## 📜 Verified Stack
- **Node.js v18+** (Backend API)
- **Solidity 0.8.20** (Smart Contracts)
- **PostgreSQL 14+** (State Management)
- **AWS S3 / KMS** (Storage & Encryption)

---

**BBSNS: Authenticity through Cryptographic Finality.**
