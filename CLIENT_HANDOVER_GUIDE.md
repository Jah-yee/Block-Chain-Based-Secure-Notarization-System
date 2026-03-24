# 🏛️ BBSNS Master Deployment & Handover Guide

This document is the **Technical Source of Truth** for the BBSNS system. It provides the exact sequence and configuration required to deploy the system from scratch on any EVM-compatible network (e.g., BNB Testnet).

---

## 🌐 Current Deployment (BNB Testnet)

The system has been fresh-deployed on **2026-03-22**.

| Contract | Address |
| :--- | :--- |
| **Genesis NFT** | `0x66a309BFeEeC137411d2B0BaA890c79b864F8886` |
| **Genesis Activation** | `0x11DAA2d0ffCCE08B138BB345e3CdBc7d7483686d` |
| **BBSNS Multi-Sig** | `0xED1873d82766D61D3A5564A62b71C6DCc1403366` |
| **Notary Registry** | `0x1A820f5975dc41c904bF221df342191694Da1f98` |
| **NTK Token** | `0x0d92A3De88202C929714df9cB24395CF4C15ba2e` |
| **Document Registry** | `0x8fdaCefB6002F56A59cef36dA94e2ee9d55D7fe6` |

---

## 🛠️ Wallet & Configuration Synchronization

To ensure the system recognizes the Genesis Admin properly, the following addresses MUST remain synchronized across all configuration files:

### 1. The Activator Wallet
- **Owner of the Genesis NFT** (at `0x66a3...`).
- Holds the initial power to call `activate()` on `GenesisActivation`.
- **Target Wallet**: `0x02252Db03aF7CD8C8d3eC6CFd3AE5f6dab69ACd0`

### 2. Synchronization Points
The following files have been automatically updated with the addresses above:
- **Backend**: `backend/.env`
- **Frontend Desktop**: `Frontend Desktop Application/.env`
- **Remote Auth**: `Frontend Desktop Application/Remote Auth/.env`

> [!IMPORTANT]
> Because Vite bakes environment variables into the build, if you change addresses in the Remote Auth `.env`, you **must** run `npm run build` again before opening the module in your browser.

---

## 2. Environment Configuration Mapping

You must update the `.env` files in **three locations** with the addresses from Section 1.

### A. Backend (`/backend/.env`)
| Key | Contract Source |
| :--- | :--- |
| `GENESIS_NFT_ADDRESS` | Step 1 |
| `GENESIS_ACTIVATION_ADDRESS` | Step 3 |
| `NOTARY_REGISTRY_ADDRESS` | Step 4 |
| `DOCUMENT_REGISTRY_ADDRESS` | Step 8 |
| `NTK_CONTRACT_ADDRESS` | Step 6 |
| `NTKR_CONTRACT_ADDRESS` | Step 7 |
| `MULTISIG_CONTRACT_ADDRESS` | Step 2 |

### B. Web-App (`/Web-App/.env.local`)
*Prefix all the above keys with `NEXT_PUBLIC_`.*
- Example: `NEXT_PUBLIC_GENESIS_NFT_ADDRESS`

### C. Desktop App (`/Frontend Desktop Application/Remote Auth/.env`)
*Prefix all the above keys with `VITE_`.*
- Example: `VITE_GENESIS_NFT_ADDRESS`

---

## 3. Post-Deployment "Handoff" Sequence

After the contracts are deployed and the servers are started:

1.  **Mint the Token:** The Developer must call `GenesisNFT.mintGenesis(ClientWalletAddress)`.
2.  **Launch Desktop:** The Client opens the Desktop App.
3.  **Connectivity Check:** Ensure the "Deployment Readiness Checklist" in the Desktop App is 100% Green.
4.  **Activation:** The Client clicks **"Launch Initialization"**.
5.  **On-Chain Onboarding:** The Client signs the `activate()` transaction in the browser.
6.  **DB Onboarding:** The Client completes the form. (A **7-day window** starts here). *This window is tracked on-chain for maximum security.*
7.  **Finalize Roles:** Grant the `RELAYER_ROLE` from `NTK` and `NTKR` to the `DocumentRegistry` contract so it can burn tokens.

---

## 4. Operational Model: Self-Paid vs. Relayer

BBSNS now supports a **Hybrid Gas Model**. You can choose how your users interact with the blockchain.

### Option A: Self-Paid (Default / Decentralized)
- **How it works:** Notaries and Owners pay their own BNB gas fees via MetaMask.
- **Client Benefit:** Zero cost for the organization. No need to fund a central wallet.
- **Requirement:** Users must have a small amount of BNB (~0.005) for gas.

### Option B: Relayer-Managed (Premium / Gasless)
- **How it works:** The organization funds a "Relayer Wallet". The backend automatically pays gas for every user action.
- **Client Benefit:** Gasless experience for users. No BNB required for Notaries/Owners.
- **Requirement:** The organization must keep the Relayer Wallet (Step 6/7 in Section 1) funded with BNB.

---

## 5. Wallet Role Requirements

*   **Founder (Signer 1):** Holds the Physical Genesis NFT. Permanent root admin.
*   **User Wallets:** Need a small amount of BNB if using the **Self-Paid** model.
*   **Relayer (Optional):** Needed only if the organization wants to provide a gasless experience.
*   **Treasury (MultiSig):** Receives the payments from NTKR token purchases.

---

## 5. Critical Fail-Safes
- **If the 7-day window expires:** The backend will reject the Genesis Admin. A developer must either redeploy `GenesisActivation` or manually insert the record into the database.
- **Relayer Access:** After deployment, ensures that the `DocumentRegistry` and `NTK` contracts have granted the `RELAYER_ROLE` to the backend wallet address.
