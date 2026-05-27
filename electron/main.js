'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow = null;
let pythonProcess = null;
let backendPort = 64430;

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0f14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,   // REQUIRED [spec 10.1]
      nodeIntegration: false,   // REQUIRED [spec 10.1]
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const uiPath = path.join(__dirname, 'src', 'index.html');
  mainWindow.loadFile(uiPath);
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  // Enable reload with F5 or Cmd+R
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
    if (input.key === 'F5') {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });
  
  console.log('\n======================================================');
  console.log(' ✨ UI FRONTEND LOADED ✨');
  console.log(` 🌐 URL: file://${uiPath}`);
  console.log('======================================================\n');

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Backend lifecycle ─────────────────────────────────────────────────────────

function resolvePythonExecutable() {
  if (process.platform === 'win32') return 'python';
  // Prefer a project venv if present (macOS dev, Linux dev, or packaged).
  // Falls back to bare python3 on PATH.
  const fs = require('fs');
  const candidates = [
    path.join(__dirname, '..', '.venv', 'bin', 'python3'),
    path.join(__dirname, '..', '.venv-linux', 'bin', 'python3'),
    // Session-local venv used when running in sandbox / CI
    '/sessions/laughing-adoring-wozniak/venv/bin/python3',
  ];
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      console.log(`[backend] Using Python: ${p}`);
      return p;
    } catch (_) { /* not found or not executable */ }
  }
  return 'python3';
}

function resolveBackendCommand() {
  if (app.isPackaged) {
    if (process.platform === 'win32') {
      // Windows packaged: embedded Python + backend source bundled as extraResources.
      // Backend source lives at app/backend/main.py so that "from backend.xxx import"
      // resolves correctly (sys.path includes app/, which contains backend/).
      const pythonExe     = path.join(process.resourcesPath, 'backend-win', 'python', 'python.exe');
      const backendScript = path.join(process.resourcesPath, 'backend-win', 'app', 'backend', 'main.py');
      console.log(`[backend] Windows packaged — python: ${pythonExe}`);
      return { executable: pythonExe, args: [backendScript] };
    } else {
      // macOS packaged: PyInstaller single-dir bundle
      const exePath = path.join(process.resourcesPath, 'backend-dist', 'backend');
      console.log(`[backend] macOS packaged — bundle: ${exePath}`);
      return { executable: exePath, args: [] };
    }
  } else {
    // Development mode: spawn Python directly
    const python = resolvePythonExecutable();
    const script = path.join(__dirname, '..', 'backend', 'main.py');
    console.log(`[backend] Dev mode — Python: ${python}`);
    return { executable: python, args: [script] };
  }
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const { executable, args } = resolveBackendCommand();

    // On Windows packaged: cwd = resources/backend-win/app so alembic.ini and
    // relative DB paths resolve correctly.
    let cwd;
    if (app.isPackaged) {
      cwd = process.platform === 'win32'
        ? path.join(process.resourcesPath, 'backend-win', 'app')
        : process.resourcesPath;
    } else {
      cwd = path.join(__dirname, '..');
    }

    pythonProcess = spawn(executable, args, { cwd });

    // Parse port from stdout [TR-3]
    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        try {
          const msg = JSON.parse(line.trim());
          if (msg.status === 'ready' && msg.port) {
            backendPort = msg.port;
            resolve(msg.port);
          }
        } catch (_) {
          // Ignore non-JSON stdout lines
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('[backend]', data.toString());
    });

    pythonProcess.on('exit', (code) => {
      console.log(`[backend] Process exited with code ${code}`);
      pythonProcess = null;
    });

    setTimeout(() => reject(new Error('Backend startup timeout after 30s')), 30000);
  });
}

function waitForHealthCheck(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function poll() {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() < deadline) return setTimeout(poll, 500);
        reject(new Error('Health check timed out'));
      });
      req.on('error', () => {
        if (Date.now() < deadline) return setTimeout(poll, 500);
        reject(new Error('Health check timed out'));
      });
      req.setTimeout(1000, () => req.destroy());
    }

    poll();
  });
}

function stopBackend() {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

// ── IPC: proxy API requests to Python backend ─────────────────────────────────

ipcMain.handle('api-request', async (_event, { method, path: apiPath, body }) => {
  if (!backendPort) {
    return { error: 'Backend not ready', status: 503 };
  }

  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: backendPort,
      path: apiPath,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ data: JSON.parse(data), status: res.statusCode });
        } catch {
          resolve({ data, status: res.statusCode });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message, status: 500 }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ error: 'Timeout', status: 408 }); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Show the window immediately so the user sees something right away.
  // The UI renders a loading state until it receives 'backend-ready'.
  createWindow();

  try {
    await startBackend();
    await waitForHealthCheck(backendPort);
    if (mainWindow) {
      mainWindow.webContents.send('backend-ready', { port: backendPort });
    }
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    // Show a visible error dialog instead of silently quitting.
    const { dialog } = require('electron');
    if (mainWindow) {
      dialog.showErrorBox(
        'DBGuree — Backend Failed to Start',
        `The Python backend could not be started.\n\n${err.message}\n\nCheck that all dependencies are installed. See the README for setup instructions.`
      );
    }
    app.quit();
  }
});

// Register stopBackend on ALL exit paths [spec 10.2]
app.on('before-quit', stopBackend);
app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
process.on('exit', stopBackend);
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });
process.on('SIGINT', () => { stopBackend(); process.exit(0); });
