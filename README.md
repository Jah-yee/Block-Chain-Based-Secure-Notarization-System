# 🛡️ BBSNS: Block-Chain Based Secure Notarization System

![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=flat&logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14.x-000000?style=flat&logo=nextdotjs&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=flat&logo=electron&logoColor=white)
![Solidity](https://img.shields.io/badge/Solidity-Smart_Contracts-363636?style=flat&logo=solidity&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat&logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

<div align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=500&size=22&duration=3000&pause=1000&color=2563EB&center=true&vCenter=true&width=800&lines=Zero-Trust+Notarization+Platform;Gasless+EIP-712+Remote+Signatures;Immutable+Document+Vault;Biometric+Identity+Verification" alt="Typing SVG" />
</div>

> **A zero-trust platform bridging off-chain identity with on-chain finality to digitize the notary public system.**

**BBSNS** is an enterprise-grade decentralized infrastructure that securely modernizes remote notarizations. By combining biometric KYC, gasless EIP-712 remote signatures, AWS S3 storage vaults, and multi-signature smart contract governance, BBSNS provides irrefutable authenticity through cryptographic finality.

## ✨ Key Features
- **Zero-Trust Architecture:** End-to-end cryptographic verification for all actors.
- **Gasless Remote Signatures:** EIP-712 compliant off-chain signing relayed securely to the blockchain.
- **Immutable Document Vault:** Documents are sealed with SHA-256 and securely hosted on AWS S3.
- **Multi-Sig Governance:** A decentralized control plane for system parameters and role management.
- **Biometric Identity:** Deep integration with secure identity providers for Notary verification.

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

## 🖋️ 3. Cryptographic Bridge (EIP-712)
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

## 🚀 4. System Requirements

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

## 📊 5. Database Entity Architecture

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : "owns"
    USERS ||--o{ UPLOAD_INTENTS : "initiates"
    DOCUMENTS ||--o{ NTKR_TRANSACTIONS : "logs"
    UPLOAD_INTENTS ||--|| DOCUMENTS : "finalizes"
```

---

## 🛡️ 6. Forensic Audit Log Schema
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

## 🚀 7. Production Hardening Guide

1. **Process Management**: Use **PM2** with clustering.
   ```bash
   pm2 start src/index.js --name "bbsns-api" -i max
   ```
2. **Reverse Proxy**: Setup **Nginx** with TLS 1.3 encryption.
3. **Database Security**: Enforce **SSL-only** connections to PostgreSQL.
4. **S3 Hygiene**: Enable **Object Lock** and **Versioning** on your production bucket.

---

**BBSNS: Authenticity through Cryptographic Finality.**
