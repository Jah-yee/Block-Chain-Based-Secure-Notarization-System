const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');
const express = require('express');

// Remote Auth Server Setup
let authServerInstance = null;
const AUTH_PORT = 3002;

function startRemoteAuthServer() {
  const authApp = express();
  // Serve static files from the build directory
  const staticPath = path.join(__dirname, 'Remote Auth', 'dist_final');
  authApp.use(express.static(staticPath));

  authServerInstance = authApp.listen(AUTH_PORT, () => {
    console.log(`[DEBUG] main.js: Remote Auth internal server started on port ${AUTH_PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[CRITICAL] main.js: Port ${AUTH_PORT} is already in use. Remote Auth server failed to start!`);
    } else {
      console.error(`[ERROR] main.js: Remote Auth server error:`, err);
    }
  });
}



function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "BBSNS - Secure Notarization Desktop",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  // CSP
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http: ws: wss:; font-src 'self' https: data:; img-src 'self' data: blob: https: http:;"
        ]
      }
    });
  });

  if (app.isPackaged) {
    const entryPath = path.join(__dirname, 'build', 'index.html');
    mainWindow.loadURL(url.pathToFileURL(entryPath).toString());
  } else {
    mainWindow.loadURL(process.env.FRONTEND_URL || 'http://localhost:3001');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

let mainWindow;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startRemoteAuthServer();
    createMainWindow();
  });
}

// 🛡️ [RESILIENCE] OS-Level Configuration Cache
const CACHE_FILE = 'config_cache.json';

ipcMain.handle('save-config-cache', async (event, data) => {
    const cachePath = path.join(app.getPath('userData'), CACHE_FILE);
    try {
        const payload = {
            data,
            timestamp: Date.now()
        };
        fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
        return true;
    } catch (err) {
        console.error(`[ERROR] main.js: Failed to write config cache:`, err.message);
        return false;
    }
});

ipcMain.handle('load-config-cache', async () => {
    const cachePath = path.join(app.getPath('userData'), CACHE_FILE);
    try {
        if (fs.existsSync(cachePath)) {
            const data = fs.readFileSync(cachePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error(`[ERROR] main.js: Failed to read config cache:`, err.message);
    }
    return null;
});

ipcMain.handle('get-config', () => null); // Deprecated

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (authServerInstance) {
    console.log('[DEBUG] main.js: Shutting down internal Remote Auth server...');
    authServerInstance.close();
  }
});
