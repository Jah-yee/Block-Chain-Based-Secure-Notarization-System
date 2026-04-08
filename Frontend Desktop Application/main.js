const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

/**
 * 🩺 [OBSERVABILITY] Structured Logger
 * Implements [TIMESTAMP] [LEVEL] [CONTEXT] message pattern with 5MB rotation guard.
 */
const logFile = path.join(app.getPath('userData'), 'app.log');

function log(level, context, message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${context}] ${message}\n`;
    
    try {
        // Simple rotation guard: If > 5MB, purge.
        if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) {
            fs.renameSync(logFile, logFile + '.old');
        }
        fs.appendFileSync(logFile, formattedMessage);
    } catch (e) {
        console.error("Failed to write to app.log:", e);
    }
}

// 🛡️ [SECURITY] authoritative API Configuration
let API_BASE_URL = app.isPackaged 
  ? 'https://api.bbsns.online' 
  : 'https://api.bbsns.online'; // 🛡️ Hardened fallback to secure production for restoration

log("INFO", "SYSTEM_BOOT", `App initialized (Packaged: ${app.isPackaged})`);

/** 🛡️ [SECURITY] Global Crash Handlers (Last Line of Defense) */
process.on('uncaughtException', (err) => {
    log("ERROR", "CRASH_UNCAUGHT", err.stack || err.message);
    app.quit();
});

process.on('unhandledRejection', (reason) => {
    log("ERROR", "CRASH_PROMISE", reason?.stack || reason?.message || "Unhandled Rejection");
});

function getPersistentDeviceId() {
    const userDataPath = app.getPath('userData');
    const deviceIdPath = path.join(userDataPath, '.device_id');
    
    if (fs.existsSync(deviceIdPath)) {
        try {
            const encryptedId = fs.readFileSync(deviceIdPath);
            return safeStorage.decryptString(encryptedId);
        } catch (e) {
            log("ERROR", "SECURITY_FAULT", "Vault Corruption detected. Regenerating identity.");
        }
    }

    const newId = crypto.randomUUID();
    const encryptedId = safeStorage.encryptString(newId);
    fs.writeFileSync(deviceIdPath, encryptedId);
    return newId;
}

function saveSecureToken(token) {
    if (!safeStorage.isEncryptionAvailable()) {
        log("ERROR", "AUTH", "Encryption unavailable. Token could not be secured.");
        return false;
    }
    const encryptedToken = safeStorage.encryptString(token);
    const tokenPath = path.join(app.getPath('userData'), '.vault');
    fs.writeFileSync(tokenPath, encryptedToken);
    return true;
}

function getSecureToken() {
    const tokenPath = path.join(app.getPath('userData'), '.vault');
    if (!fs.existsSync(tokenPath)) return null;
    try {
        const encryptedToken = fs.readFileSync(tokenPath);
        return safeStorage.decryptString(encryptedToken);
    } catch (e) {
        log("ERROR", "AUTH", "Token decryption failed.");
        return null;
    }
}

function clearSecureToken() {
    const tokenPath = path.join(app.getPath('userData'), '.vault');
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
}

const ALLOWED_ENDPOINTS = [
    '/api/auth/me',
    '/api/system/sync/health',
    '/api/system/sync/events',
    '/api/system/sync/retry',
    '/api/governance/alerts/count',
    '/api/notary/requests/pending',
    '/api/notary/requests/approved',
    '/api/notary/requests/details/'
];

function isEndpointAllowed(endpoint) {
    const cleanPath = path.normalize(endpoint).replace(/\\/g, '/');
    return ALLOWED_ENDPOINTS.some(allowed => 
        allowed.endsWith('/') ? cleanPath.startsWith(allowed) : cleanPath === allowed
    );
}

async function authenticatedRequest(endpoint, method = 'GET', data = null) {
    if (!isEndpointAllowed(endpoint)) {
        log("WARN", "SECURITY", `Blocked unauthorized access attempt to: ${endpoint}`);
        throw new Error('ACCESS_DENIED');
    }

    const token = await getSecureToken();
    if (!token && endpoint !== '/api/auth/system-status') throw new Error('UNAUTHORIZED');

    const axiosConfig = {
        url: `${API_BASE_URL}${endpoint}`,
        method,
        data,
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 3000
    };

    try {
        let attempts = 0;
        const maxAttempts = method.toUpperCase() === 'GET' ? 2 : 1;
        while (attempts < maxAttempts) {
            try {
                const response = await axios(axiosConfig);
                return response.data;
            } catch (err) {
                attempts++;
                if (attempts >= maxAttempts) {
                    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
                        log("ERROR", "NETWORK_FAULT", `Timeout (3s) on ${endpoint}`);
                        throw new Error('DEGRADED');
                    }
                    if (err.code === 'ECONNREFUSED') {
                        log("ERROR", "NETWORK_FAULT", `Connection Refused on ${endpoint}`);
                        throw new Error('OFFLINE');
                    }
                    if (err.response && err.response.status === 401) {
                        log("WARN", "AUTH", `401 Unauthorized for ${endpoint}. Evicting session.`);
                        handleUnauthorized();
                        throw new Error('AUTH_LOST');
                    }
                    throw err;
                }
                if (method.toUpperCase() === 'GET') await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (err) { throw err; }
}

let isLoggingOut = false;
function handleUnauthorized() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    clearSecureToken();
    if (mainWindow) mainWindow.webContents.send('auth:status-changed', { status: 'unauthorized' });
    setTimeout(() => { isLoggingOut = false; }, 5000);
}

/**
 * 🛡️ [SECURITY] Configuration Caching (SafeStorage)
 * Persists the trusted system configuration in the UserData directory.
 */
const CONFIG_PATH = path.join(app.getPath('userData'), 'bbsns.config');

async function saveConfigCache(data) {
    try {
        const encrypted = safeStorage.encryptString(JSON.stringify(data));
        fs.writeFileSync(CONFIG_PATH, encrypted);
        log("INFO", "CONFIG_CACHE", "Master configuration persisted (Encrypted).");
        return true;
    } catch (e) {
        log("ERROR", "CONFIG_CACHE", "Failed to cache config: " + e.message);
        return false;
    }
}

async function loadConfigCache() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return null;
        const encrypted = fs.readFileSync(CONFIG_PATH);
        const decrypted = safeStorage.decryptString(encrypted);
        log("INFO", "CONFIG_CACHE", "Master configuration restored from OS cache.");
        return { data: JSON.parse(decrypted), timestamp: fs.statSync(CONFIG_PATH).mtimeMs };
    } catch (e) {
        log("ERROR", "CONFIG_CACHE", "Failed to restore config cache: " + e.message);
        return null; // Don't throw, just return null so UI can fallback
    }
}

let pollingInterval = null;
async function startAuthFlow() {
    log("INFO", "AUTH_HANDSHAKE", "Initiating remote handshake with " + API_BASE_URL);
    try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/remote/session`, {
            device_id: getPersistentDeviceId()
        }, { timeout: 5000 });
        
        const rawData = response.data;
        const sessionId = rawData.sessionId || rawData.session_id;

        if (!sessionId) {
            log("ERROR", "AUTH_HANDSHAKE_FAIL", "INVALID_SESSION_ID");
            throw new Error("INVALID_SESSION_ID");
        }

        const AUTH_BASE = "https://auth.bbsns.online";
        const AUTH_ROUTE = "/";
        const authUrl = `${AUTH_BASE}${AUTH_ROUTE}?sessionId=${sessionId}`;

        log("INFO", "AUTH_HANDSHAKE", "Handshake active. URL: " + authUrl);
        shell.openExternal(authUrl);
        
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            try {
                const url = `${API_BASE_URL}/api/auth/remote/status/${sessionId}`;
                log("DEBUG", "AUTH_POLL", `Checking: ${url}`);
                const pollRes = await axios.get(url);
                const { status, code: one_time_code } = pollRes.data;
                
                if (status === 'authorized' && one_time_code) {
                    log("INFO", "AUTH_POLL", `Authorized! Exchanging code with: ${API_BASE_URL}`);
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    const exchangeRes = await axios.post(`${API_BASE_URL}/api/auth/remote/exchange`, {
                        sessionId, code: one_time_code, device_id: getPersistentDeviceId()
                    });
                    saveSecureToken(exchangeRes.data.token);
                    log("INFO", "AUTH", "Remote Handshake Successful. Token persisted.");
                    if (mainWindow) mainWindow.webContents.send('auth:status-changed', { status: 'authorized', user: exchangeRes.data.user });
                } else if (status === 'expired') {
                    clearInterval(pollingInterval);
                    log("WARN", "AUTH", "Remote Handshake Expired.");
                    if (mainWindow) mainWindow.webContents.send('auth:status-changed', { status: 'expired' });
                }
            } catch (pollErr) { 
                log("ERROR", "AUTH", `Polling link degraded: ${pollErr.message}`); 
            }
        }, 2000);
        return { sessionId: "[HIDDEN]" };
    } catch (err) {
        let reason = err.message;
        if (err.code === 'ECONNREFUSED') reason = "CONNECTION_REFUSED_BY_BACKEND";
        if (err.code === 'ETIMEDOUT') reason = "CONNECTION_TIMEOUT_5S";
        if (err.response) reason = `HTTP_${err.response.status}_${JSON.stringify(err.response.data)}`;

        log("ERROR", "AUTH", "Auth Handshake Failed: " + reason);
        throw new Error("Handshake Failed: " + reason);
    }
}

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true },
    titleBarOverlay: {
      color: '#0a1d2d',
      symbolColor: '#ffffff',
      height: 32
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#07090e'
  });

  const productionPath = path.join(__dirname, 'build', 'index.html');
  const devUrl = 'http://localhost:3001';

  if (app.isPackaged && fs.existsSync(productionPath)) {
    mainWindow.loadFile(productionPath);
    log("INFO", "UI_LOAD", "Loading production static assets from build/index.html");
  } else {
    mainWindow.loadURL(devUrl);
    log("INFO", "UI_LOAD", "Loading dev environment from localhost:3001");
  }
}

app.whenReady().then(() => {
  if (!safeStorage.isEncryptionAvailable() && app.isPackaged) {
    log("ERROR", "SECURITY", "DPAPI unavailable. System terminating.");
    dialog.showErrorBox("SECURITY_ERROR", "BBSNS Console requires OS encryption. DPAPI/SafeStorage unavailable.");
    app.quit();
    return;
  }
  createWindow();
  ipcMain.handle('auth:start', startAuthFlow);
  ipcMain.handle('auth:check-session', async () => !!(await getSecureToken()));
  ipcMain.handle('auth:logout', async () => handleUnauthorized());
  ipcMain.on('open-external', (event, url) => shell.openExternal(url));
  ipcMain.handle('config:save', async (event, data) => saveConfigCache(data));
  ipcMain.handle('config:load', async () => loadConfigCache());
  ipcMain.handle('config:sync-api-url', (event, url) => {
    if (url && url.startsWith('http')) {
        log("INFO", "CONFIG_SYNC", `Main Process API_BASE_URL synchronized to: ${url}`);
        API_BASE_URL = url;
        return true;
    }
    return false;
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
