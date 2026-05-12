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
        S3[AWS S3 Vault]
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

## 🔐 2. Configuration & Secrets

Before deployment, populate the following environment variables in your `.env` files. **Never share these production values.**

### **Backend Configuration (`backend/.env`)**
| Key | Description | Placeholder Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL Connection String | `postgresql://user:password@localhost:5432/bbsns_db` |
| `JWT_SECRET` | Secret key for session encryption | `[GENERATE_A_64_CHAR_RANDOM_STRING]` |
| `AWS_ACCESS_KEY_ID` | AWS IAM User Key | `[YOUR_AWS_ACCESS_KEY]` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret | `[YOUR_AWS_SECRET_KEY]` |
| `AWS_S3_BUCKET` | Target S3 Bucket Name | `bbsns-production-vault` |
| `BNB_SYSTEM_PRIVATE_KEY` | Protocol Relayer Authority | `[0x_YOUR_RELAYER_PRIVATE_KEY]` |

### **Smart Contract Directory**
| Contract | Description | Deployment Address |
| :--- | :--- | :--- |
| **DocumentRegistry** | Master Record Store | `0x0000000000000000000000000000000000000000` |
| **NotaryRegistry** | Identity & Role Store | `0x0000000000000000000000000000000000000000` |
| **NTKR Token** | Reputation & Access Token | `0x0000000000000000000000000000000000000000` |
| **BBSNSMultiSig** | Governance Threshold | `0x0000000000000000000000000000000000000000` |

---

## 📂 3. Document State Machine (Authoritative)
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

## 🚀 5. System Requirements

### **API Server (Backend)**
- **OS**: Linux (Ubuntu 22.04 recommended) or Windows Server.
- **CPU**: 2+ Cores (optimized for bcrypt & crypto).
- **RAM**: 4GB Minimum (8GB recommended for concurrent worker threads).
- **Node.js**: v18.17.0 or higher.

### **Desktop Console (Notary)**
- **OS**: Windows 10/11 (64-bit).
- **RAM**: 4GB Minimum.
- **Dependency**: Microsoft Edge (for Remote Auth Bridge).

---

## 📊 6. Database Entity Architecture

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : "owns"
    USERS ||--o{ UPLOAD_INTENTS : "initiates"
    DOCUMENTS ||--o{ NTKR_TRANSACTIONS : "logs"
    UPLOAD_INTENTS ||--|| DOCUMENTS : "finalizes"
```

---

## 🛡️ 7. Forensic Audit Log Schema
Every request through the `actor.js` middleware generates a correlated audit trail in the following format:

```json
{
  "requestId": "UUID-V4",
  "actorId": "101",
  "role": "NOTARY",
  "capability": "DOC_SIGNATURE_PAYLOAD",
  "env": "VERIFIED",
  "chainId": "97",
  "timestamp": "2024-05-12T10:00:00Z"
}
```

---

## 🚀 8. Production Hardening Guide

1. **Process Management**: Use **PM2** with clustering.
   ```bash
   pm2 start src/index.js --name "bbsns-api" -i max
   ```
2. **Reverse Proxy**: Setup **Nginx** with TLS 1.3 encryption.
3. **Database Security**: Enforce **SSL-only** connections to PostgreSQL.
4. **S3 Hygiene**: Enable **Object Lock** and **Versioning** on your production bucket.

---

**BBSNS: Authenticity through Cryptographic Finality.**
