const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

// [SECURITY] Device Identity Cache (Fast Retrieval)
let deviceIdCache = null;

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
let API_BASE_URL = 'https://api.bbsns.online'; // Production Source of Truth

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
    if (deviceIdCache) {
        log("INFO", "SECURITY", "Device ID retrieved from memory cache.");
        return deviceIdCache;
    }

    const userDataPath = app.getPath('userData');
    const deviceIdPath = path.join(userDataPath, '.device_id');
    
    let deviceId = null;
    if (fs.existsSync(deviceIdPath)) {
        try {
            const encryptedId = fs.readFileSync(deviceIdPath);
            deviceId = safeStorage.decryptString(encryptedId);
        } catch (e) {
            log("ERROR", "SECURITY_FAULT", "Vault Corruption detected. Regenerating identity.");
        }
    }

    if (!deviceId) {
        deviceId = crypto.randomUUID();
        const encryptedId = safeStorage.encryptString(deviceId);
        fs.writeFileSync(deviceIdPath, encryptedId);
        log("INFO", "SECURITY", "New Device ID generated and secured.");
    }

    deviceIdCache = deviceId;
    log("INFO", "SECURITY", "Device ID handler invoked.");
    return deviceId;
}

function saveSecureToken(token) {
    if (!token) return false;
    if (!safeStorage.isEncryptionAvailable()) {
        log("ERROR", "AUTH", "Encryption unavailable. Token could not be secured.");
        return false;
    }

    try {
        // 🛡️ [SECURITY] Bunker V3.8: Dual-Monotonic Versioning Gate
        // Protects against race conditions where an older token overwrite a newer one.
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error("Invalid JWT format");
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const newBlock = payload.snapshotBlock || 0;
        const newIat = payload.iat || 0;

        const oldToken = getSecureToken();
        if (oldToken) {
            try {
                const oldParts = oldToken.split('.');
                if (oldParts.length === 3) {
                    const oldPayload = JSON.parse(Buffer.from(oldParts[1], 'base64').toString());
                    const oldBlock = oldPayload.snapshotBlock || 0;
                    const oldIat = oldPayload.iat || 0;

                    const isNewer = (newBlock > oldBlock) || (newBlock === oldBlock && newIat > oldIat);
                    if (!isNewer) {
                        log("INFO", "AUTH", `[VERSION_GATE] Ignored old/identical token. (B:${newBlock} vs B:${oldBlock}, T:${newIat} vs T:${oldIat})`);
                        return false;
                    }
                }
            } catch (e) {
                log("WARN", "AUTH", "Vault parsing failed during version check. Overwriting.");
            }
        }

        const encryptedToken = safeStorage.encryptString(token);
        const tokenPath = path.join(app.getPath('userData'), '.vault');
        fs.writeFileSync(tokenPath, encryptedToken);
        
        log("INFO", "AUTH", `Token secured → B:${newBlock} | T:${newIat}`);
        return true;
    } catch (err) {
        log("ERROR", "AUTH_VULNERABILITY", `Failed to secure token: ${err.message}`);
        return false;
    }
}

function getSecureToken() {
    const tokenPath = path.join(app.getPath('userData'), '.vault');
    if (!fs.existsSync(tokenPath)) return null;
    try {
        const encryptedToken = fs.readFileSync(tokenPath);
        const token = safeStorage.decryptString(encryptedToken);
        return isValidToken(token) ? token : null;
    } catch (e) {
        log("ERROR", "AUTH", "Token decryption failed.");
        return null;
    }
}

/**
 * 🛡️ [SANITATION] Multi-Layer Token Firewall
 */
function isValidToken(token) {
    if (typeof token !== 'string') return false;
    if (token.length < 20) return false;
    if (token === 'null' || token === 'undefined') return false;
    return true;
}

/**
 * 🛡️ [SELF-HEALING] Auth Recovery Orchestration
 * Responsibility: Periodically attempts to upgrade DEGRADED sessions or refresh stale ones.
 */
let recoveryInterval = null;
let currentBackoff = 30000; 
let activeRefreshPromise = null;

async function getRefreshedToken(reason = "PROACTIVE") {
    if (activeRefreshPromise) {
        log("INFO", "RECOVERY", `[SINGLE_FLIGHT] Co-alescing parallel refresh request (${reason})`);
        return activeRefreshPromise;
    }
    
    activeRefreshPromise = attemptSecurityUpgrade(reason).finally(() => {
        activeRefreshPromise = null;
    });
    return activeRefreshPromise;
}

async function attemptSecurityUpgrade(reason = "PROACTIVE") {
    const token = await getSecureToken();
    if (!token) return stopAuthRecoveryWorker();

    log("INFO", "RECOVERY", `Initiating recovery handshake (Reason: ${reason})...`);

    try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/remote/refresh-zero-trust`, {}, {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 8000
        });

        const { status, token: newToken, user } = response.data;

        if (status === 'VERIFIED') {
            const rotated = saveSecureToken(newToken);
            if (rotated) {
                log("INFO", "RECOVERY", "✅ Handshake SUCCESS. Token rotated.");
                if (mainWindow) {
                    mainWindow.webContents.send('auth:status-changed', {
                        status: 'authorized',
                        user,
                        zeroTrustStatus: 'VERIFIED',
                        message: "Security Authority Restored"
                    });
                }
            } else {
                log("INFO", "RECOVERY", "Handshake succeeded but token was already fresh/older (Ignored).");
            }
            
            // Reset backoff on success
            currentBackoff = 30000;
            return true;
        } else if (status === 'REAUTH_REQUIRED' || status === 'BANNED') {
            log("WARN", "RECOVERY", `Handshake REJECTED (${status}). Terminating session.`);
            handleUnauthorized();
            return false;
        } else if (response.status === 429) {
            const retryAfter = (response.headers['retry-after'] || 30) * 1000;
            log("WARN", "RECOVERY", `Rate limited. Backing off for ${retryAfter}ms`);
            currentBackoff = Math.max(currentBackoff, retryAfter);
            return false;
        } else {
            // Still DEGRADED - increase backoff
            currentBackoff = Math.min(currentBackoff * 2, 300000); // Max 5m (300s)
            log("INFO", "RECOVERY", `Still DEGRADED. Next attempt in ${currentBackoff/1000}s`);
            restartRecoveryTimer();
            return false;
        }
    } catch (err) {
        const status = err.response?.status;
        log("ERROR", "RECOVERY", `Handshake FAILED [${status}]: ${err.message}`);
        
        if (status === 401 || status === 403) {
            handleUnauthorized();
        } else {
            currentBackoff = Math.min(currentBackoff * 2, 300000);
            restartRecoveryTimer();
        }
        return false;
    }
}

function startAuthRecoveryWorker() {
    if (recoveryInterval) return;
    log("INFO", "RECOVERY", "Starting Global Recovery Worker...");
    currentBackoff = 30000;
    restartRecoveryTimer();
}

function stopAuthRecoveryWorker() {
    if (recoveryInterval) {
        log("INFO", "RECOVERY", "Stopping Global Recovery Worker.");
        clearTimeout(recoveryInterval);
        recoveryInterval = null;
    }
}

function restartRecoveryTimer() {
    if (recoveryInterval) clearTimeout(recoveryInterval);
    recoveryInterval = setTimeout(() => getRefreshedToken("PROACTIVE"), currentBackoff);
}

function clearSecureToken() {
    const tokenPath = path.join(app.getPath('userData'), '.vault');
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
}

const ALLOWED_ROUTES = [
    // 🔐 AUTH
    { path: /^\/api\/auth\/system-status$/, methods: ["GET"] },
    { path: /^\/api\/auth\/nonce$/, methods: ["POST"] },
    { path: /^\/api\/auth\/me$/, methods: ["GET"] },

    // 🏢 NOTARY FLOW
    { path: /^\/api\/notaries\/applications$/, methods: ["GET", "POST"] },
    { path: /^\/api\/notaries\/applications\/[\w-]+\/verify$/, methods: ["POST"] },
    { path: /^\/api\/notaries\/applications\/[\w-]+\/approve$/, methods: ["POST"] },
    { path: /^\/api\/notaries\/applications\/[\w-]+\/reject$/, methods: ["POST"] },
    { path: /^\/api\/notaries$/, methods: ["GET"] },

    // 📂 DOCUMENT FLOW
    { path: /^\/api\/documents$/, methods: ["GET"] },
    { path: /^\/api\/documents\/[\w-]+$/, methods: ["GET"] },
    { path: /^\/api\/documents\/[\w-]+\/update$/, methods: ["PATCH"] },
    { path: /^\/api\/documents\/[\w-]+\/approve$/, methods: ["POST"] },
    { path: /^\/api\/documents\/[\w-]+\/file$/, methods: ["GET"] },
    { path: /^\/api\/documents\/[\w-]+\/signature-payload$/, methods: ["GET"] },

    // ⚖️ GOVERNANCE (Dashboard Visibility)
    { path: /^\/api\/governance\/proposals$/, methods: ["GET"] },
    { path: /^\/api\/governance\/multisig\/settings$/, methods: ["GET"] },
    { path: /^\/api\/governance\/multisig\/stats$/, methods: ["GET"] },
    { path: /^\/api\/governance\/multisig\/transactions$/, methods: ["GET"] },
    { path: /^\/api\/governance\/alerts\/count$/, methods: ["GET"] },

    // 👤 OWNER FLOW
    { path: /^\/api\/documents\/initiate$/, methods: ["POST"] },
    { path: /^\/api\/documents\/confirm$/, methods: ["POST"] },

    // 🔬 SYSTEM TELEMETRY
    { path: /^\/api\/system\/logs$/, methods: ["GET"] },
    { path: /^\/api\/system\/sync\/events$/, methods: ["GET"] },

    // 🪙 TOKEN FLOW
    { path: /^\/api\/tokens\/onchain\/[\w-]+\/[\w-]+$/, methods: ["GET"] }
];

function validateRequest(endpoint, method) {
    const cleanMethod = (method || 'GET').toUpperCase();
    
    // 1. Normalize Path (Remove query params, decode URI)
    const parsed = new URL(endpoint, "http://localhost");
    const cleanPath = decodeURIComponent(parsed.pathname).replace(/\\/g, '/');

    // 2. Reject Suspicious Input
    if (cleanPath.includes("..")) return false;

    // 3. Match against Whitelist
    return ALLOWED_ROUTES.some(route => 
        route.path.test(cleanPath) && route.methods.includes(cleanMethod)
    );
}

async function authenticatedRequest(endpoint, method = 'GET', data = null) {
    if (!validateRequest(endpoint, method)) {
        log("WARN", "SECURITY_VIOLATION", `Background worker blocked: ${method} ${endpoint}`);
        throw { code: "ACCESS_DENIED", message: "Unauthorized API access attempt" };
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
let currentTraceId = null;
async function startAuthFlow() {
    currentTraceId = Date.now().toString();
    log("INFO", "AUTH_HANDSHAKE", `[TRACE ${currentTraceId}] Initiating remote handshake with ${API_BASE_URL}`);
    try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/remote/session`, {
            device_id: getPersistentDeviceId()
        }, { timeout: 5000 });
        
        const rawData = response.data;
        const sessionId = rawData.sessionId || rawData.session_id;
        const sessionSecret = rawData.sessionSecret;
        const deviceId = getPersistentDeviceId();

        if (!sessionId) {
            log("ERROR", "AUTH_HANDSHAKE_FAIL", "INVALID_SESSION_ID");
            throw new Error("INVALID_SESSION_ID");
        }

        const AUTH_BASE = "https://auth.bbsns.online";
        const AUTH_ROUTE = "/";
        const authUrl = `${AUTH_BASE}${AUTH_ROUTE}?mode=login&sessionId=${sessionId}`;

        log("INFO", "AUTH_HANDSHAKE", "Handshake active. URL: " + authUrl);
        shell.openExternal(authUrl);
         if (pollingInterval) clearInterval(pollingInterval);
        
        const startTime = Date.now();
        const MAX_POLL_TIME = 180000; // 3 Minute Hard Timeout
        
        pollingInterval = setInterval(async () => {
            try {
                // 1. Check client-side timeout
                if (Date.now() - startTime > MAX_POLL_TIME) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    log("WARN", "AUTH_TRACE", "[TIMEOUT] Client-side remote auth timeout exceeded.");
                    if (mainWindow) mainWindow.webContents.send('auth:status-changed', { status: 'expired', error: 'Handshake Timed Out' });
                    return;
                }

                const url = `${API_BASE_URL}/api/auth/remote/status/${sessionId}`;
                const pollRes = await axios.get(url, {
                    headers: {
                        'x-device-id': deviceId,
                        'x-session-secret': sessionSecret
                    }
                });
                
                // [TRACE 1] Polling Response
                const { status, token, user } = pollRes.data;
                log("INFO", "AUTH_TRACE", `[STEP 1] POLL_STATUS: ${status} (sid=${sessionId.substring(0,8)})`);
                
                // 2. [SUCCESS] Session Completed & Identity Bound
                if (status === 'completed') {
                    if (!token) {
                        log("ERROR", "AUTH_TRACE", "[FAULT] completed state but missing token");
                        return;
                    }

                    log("INFO", "AUTH_TRACE", `[STEP 2] IDENTITY_RECEIVED: user_id=${user?.id}`);
                    clearInterval(pollingInterval);
                    pollingInterval = null;

                    // A. Persist Token
                    saveSecureToken(token);

                    // B. Notify UI
                    const rawStatus = pollRes.data.zeroTrustStatus;
                    const validStatuses = ["VERIFIED", "DEGRADED", "UNKNOWN"];
                    let zeroTrustStatus;

                    if (!rawStatus || !validStatuses.includes(rawStatus)) {
                        console.warn("[ZERO_TRUST] Auth poll missing/invalid status. Defaulting to UNKNOWN.", { received: rawStatus });
                        zeroTrustStatus = "UNKNOWN";
                    } else {
                        zeroTrustStatus = rawStatus;
                    }

                    const ipcPayload = { 
                        status: 'authorized', 
                        user: user, 
                        zeroTrustStatus,
                        traceId: currentTraceId 
                    };
                    
                    log("INFO", "AUTH_TRACE", `[STEP 3] IPC_AUTHORIZED_SEND`);
                    if (mainWindow) mainWindow.webContents.send('auth:status-changed', ipcPayload);
                    return;
                }

                // 3. [FAILURE] Session Expired or Explicitly Failed
                if (status === 'expired' || status === 'failed') {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    log("WARN", "AUTH_TRACE", `[TERMINAL] Session ${status}`);
                    if (mainWindow) mainWindow.webContents.send('auth:status-changed', { status, traceId: currentTraceId });
                }

            } catch (pollErr) { 
                const statusCode = pollErr.response?.status;
                if (statusCode === 404) {
                    // Session consumed or missing
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    log("WARN", "AUTH_TRACE", "[CONSUMED] Session no longer available.");
                    return;
                }
                
                if (statusCode === 429) {
                    log("ERROR", "API_THROTTLE", "Rate limited on /auth/status");
                    return;
                }
                
                log("ERROR", "AUTH", `Polling link degraded: ${pollErr.message}`); 
            }
        }, 3000); // Poll every 3 seconds
        
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
  ipcMain.handle('auth:trigger-recovery', async () => attemptSecurityUpgrade());
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

  // 🛡️ [SECURITY] Device Identity Bridge
  ipcMain.handle('auth:get-device-id', async () => getPersistentDeviceId());
  
  // 🛡️ [SECURITY] authoritative Session Authority
  // Pull API for renderer to recover identity without localStorage
  ipcMain.handle('auth:get-session', async () => {
    log("INFO", "AUTH", "Session retrieval (auth:get-session) initiated by renderer.");
    const token = await getSecureToken();
    
    if (!token) {
        log("INFO", "AUTH", "No token in vault. Returning unauthenticated.");
        return { authenticated: false };
    }

    try {
        const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 5000 // Increased from 1500ms to handle blockchain resolution
        });
        
        const user = response.data.user;
        if (!user) {
            log("INFO", "AUTH", "Backend returned null user (Invalid/Expired Token). Returning unauthenticated.");
            return { authenticated: false };
        }

        const rawStatus = user?.zeroTrustStatus;
        const validStatuses = ["VERIFIED", "DEGRADED", "UNKNOWN"];
        
        let zeroTrustStatus;
        if (!rawStatus || !validStatuses.includes(rawStatus)) {
            console.warn("[ZERO_TRUST] Invalid or missing status from backend", {
                endpoint: "/api/auth/me",
                received: rawStatus,
                fallback: "UNKNOWN"
            });
            zeroTrustStatus = "UNKNOWN";
        } else {
            zeroTrustStatus = rawStatus;
        }
        
        // 🛡️ [SELF-HEALING] Bunker V3.6.1: Snapshot Rotation
        if (response.data.token) {
            log("INFO", "AUTH", "[ROTATION] Refreshed token detected during session recovery.");
            saveSecureToken(response.data.token);
        }

        log("INFO", "AUTH", `Session retrieval success for user: ${user.id} | Status: ${zeroTrustStatus}`);
        return { authenticated: true, user, zeroTrustStatus };
    } catch (err) {
        const status = err.response ? err.response.status : "NETWORK_ERROR";
        log("ERROR", "AUTH", `Session recovery failed [${status}]: ${err.message}`);
        return { authenticated: false };
    }
  });

  // 🛡️ [SECURITY] Authenticated API Bridge
  // Re-routes renderer requests through the main process to inject secure tokens
  ipcMain.handle('api:call', async (event, endpoint, method = 'GET', data = null) => {
    const cleanMethod = (method || 'GET').toUpperCase();

    // 🛡️ [SECURITY] Hardened Path Enforcement
    if (!validateRequest(endpoint, cleanMethod)) {
        const parsed = new URL(endpoint, "http://localhost");
        const tokenExists = !!(await getSecureToken());
        const isPublicRequest = [
            '/api/auth/system-status', '/api/auth/nonce', '/api/auth/remote/session', 
            '/api/auth/remote/exchange', '/api/auth/remote/authorize', 
            '/api/auth/remote/status', '/api/auth/remote/verify', '/api/auth/remote/callback'
        ].includes(parsed.pathname);

        if (!isPublicRequest) {
            log("WARN", "SECURITY_VIOLATION", `Unauthorized Bridge Access: ${cleanMethod} ${endpoint}`);
            return {
                success: false,
                error: { code: "ACCESS_DENIED", message: "Unauthorized API access attempt" }
            };
        }
    }

    try {
        // 🛡️ [SELF-HEALING] Bunker V3.8: Hardened Atomic Recovery Bridge
        // Intercepts 426 'Upgrade Required' and transparently heals the session.
        async function executeWithHealing(retryCount = 0) {
            const tokenValue = await getSecureToken();
            const currentToken = isValidToken(tokenValue) ? tokenValue : null;
            
            const headers = { 
                'Content-Type': 'application/json',
                'x-client-source': 'desktop'
            };

            if (currentToken) {
                headers['Authorization'] = `Bearer ${currentToken}`;
            } else {
                log("INFO", "BRIDGE_SANITATION", "Proceeding without Authorization header (No valid token found).");
            }

            const cleanBase = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const fullUrl = `${cleanBase}${cleanEndpoint}`;

            const axiosConfig = { method: cleanMethod, url: fullUrl, headers, timeout: 5000 };
            if (cleanMethod !== 'GET' && data) axiosConfig.data = data;

            try {
                log("INFO", "API_BRIDGE", `→ ${cleanMethod} ${endpoint} (v=${retryCount})`);
                const response = await axios(axiosConfig);
                
                // Proactive Healing: If backend returns a token in a valid response, save it.
                if (response.data && response.data.token) {
                    saveSecureToken(response.data.token);
                }
                
                return { success: true, data: response.data };
            } catch (error) {
                const status = error.response ? error.response.status : 'NETWORK_ERROR';
                
                // 🔐 [CRITICAL] 426 Upgrade Trigger
                if (status === 426 && retryCount === 0) {
                    log("WARN", "AUTH", `[426_INTERCEPT] Stale session detected for ${endpoint}. Initiating recovery...`);
                    
                    const healed = await getRefreshedToken("ACTIVE_RECOVERY");
                    if (healed) {
                        // Re-fetch token from vault before retry to ensure latest snapshot
                        const newToken = await getSecureToken();
                        
                        // Idempotency Gate: If block unchanged, only skip if it's a GET. 
                        // Mutations must always re-transmit with new context.
                        if (cleanMethod === 'GET') {
                            const payload = JSON.parse(Buffer.from(newToken.split('.')[1], 'base64').toString());
                            const oldPayload = JSON.parse(Buffer.from(currentToken.split('.')[1], 'base64').toString());
                            if (payload.snapshotBlock === oldPayload.snapshotBlock) {
                                log("INFO", "AUTH", "[IDEMPOTENCY] Block unchanged after heal. Skipping GET retry.");
                                return { success: false, error: { status: 426, message: "Block unchanged after recovery handshake" } };
                            }
                        }
                        
                        log("INFO", "AUTH", "[RETRY] Session authority restored. Retrying original request...");
                        return executeWithHealing(retryCount + 1);
                    } else {
                        log("ERROR", "AUTH", "[TERMINAL] Recovery handshake failed. Rejecting request.");
                        return { success: false, error: { status: 401, message: "Handshake required" } };
                    }
                }

                // Standard Error Handling
                let detail = error.message;
                if (error.response?.data) detail += ` | Body: ${JSON.stringify(error.response.data).slice(0, 300)}`;
                log("ERROR", "API_BRIDGE", `← ${status} ${endpoint} | Error: ${detail}`);

                return {
                    success: false,
                    error: {
                        message: error.message,
                        status: status,
                        data: error.response ? error.response.data : null,
                        endpoint
                    }
                };
            }
        }

        return await executeWithHealing();

    } catch (globalErr) {
        log("ERROR", "API_BRIDGE_FATAL", globalErr.message);
        return { success: false, error: { message: globalErr.message } };
    }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
