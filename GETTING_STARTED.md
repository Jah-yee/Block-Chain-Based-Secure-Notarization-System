# Getting Started with BBSNS

Welcome to the Blockchain-Based Secure Notarization System (BBSNS). This guide provides instructions on how to initialize and run the various components of the system.

## Prerequisites
- **Node.js**: v18 or higher.
- **PostgreSQL**: v14 or higher (Running on port 5433 or as configured in `.env`).
- **MetaMask**: Installed in your browser for web interaction.

---

## 1. Backend Server
The backend handles API requests, database interactions, and blockchain relaying.

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the environment:
   - Ensure the `.env` file contains valid database credentials, BNB Testnet RPC URL, and the Relayer's private key.
4. Start the server:
   ```bash
   npm start
   ```
   The backend will be available at `http://localhost:5000`.

---

## 2. Web Application
The web-app is the primary interface for document owners to submit requests.

1. Navigate to the `web-app` directory:
   ```bash
   cd web-app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 3. Desktop Application
The desktop app is designed for Admins and Notaries to manage the system securely.

1. Navigate to the `Frontend Desktop Application` directory:
   ```bash
   cd "Frontend Desktop Application"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```
   The desktop application will launch as an Electron window.

---

## 4. Administrative Handshake
To authorize the Desktop App to interact with the Backend via the system browser:
1. Ensure the `Admin-Remote-Auth` service is running:
   ```bash
   cd Admin-Remote-Auth
   npx serve -l 3002 ./
   ```

---

## System Purge & Security
The system has been purged of all non-admin users. To add new notaries or owners:
1. Use the **Admin Dashboard** in the Desktop Application.
2. Ensure you have sufficient **NTKR** tokens for on-chain actions.
