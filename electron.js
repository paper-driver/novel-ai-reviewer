const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Setup logging to file for packaged app debugging
const logFile = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logToFile(message) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
  console.log(message);
}

// Helper to find node binary
function findNodeBinary() {
  const commonPaths = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
    process.execPath
  ];
  
  for (const nodePath of commonPaths) {
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  }
  
  return 'node'; // Fallback to PATH lookup
}

// Helper to copy directories recursively
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  fs.readdirSync(src).forEach(file => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDirSync(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

// Check if --prod flag is passed, otherwise check if in production environment
const hasProdsFlag = process.argv.includes('--prod');
const isDev = process.env.NODE_ENV !== 'production' && !hasProdsFlag && !app.isPackaged;

logToFile('[Electron] Dev mode: ' + isDev);
logToFile('[Electron] App packaged: ' + app.isPackaged);
logToFile('[Electron] NODE_ENV: ' + process.env.NODE_ENV);
logToFile('[Electron] Args: ' + process.argv.slice(1));

let mainWindow;
let serverProcess;

// Spawn the Node.js backend server
function startServer() {
  return new Promise((resolve, reject) => {
    logToFile('[Electron] Starting server process...');
    
    let serverPath = path.join(__dirname, 'server.modular.js');
    let cwd = __dirname;
    
    // In packaged app, extract server and node_modules from asar to temp directory
    if (app.isPackaged) {
      logToFile('[Electron] App is packaged, extracting to temp...');
      const tempDir = path.join(app.getPath('temp'), 'novel-ai-reviewer');
      
      // Clear temp directory to ensure fresh extraction
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          logToFile('[Electron] Cleared temp directory: ' + tempDir);
        } catch (err) {
          logToFile('[Electron] Warning: Could not clear temp directory: ' + err.message);
        }
      }
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Copy server directory to temp if it exists
      const sourceServer = path.join(__dirname, 'server');
      const destServerDir = path.join(tempDir, 'server');
      if (fs.existsSync(sourceServer) && !fs.existsSync(destServerDir)) {
        copyDirSync(sourceServer, destServerDir);
        logToFile('[Electron] Server directory extracted to: ' + destServerDir);
      }
      
      // Always copy google-vision-credentials.json (it may have been updated)
      let sourceCredentials = path.join(app.getAppPath(), 'google-vision-credentials.json');
      let destCredentials = path.join(tempDir, 'google-vision-credentials.json');
      
      logToFile('[Electron] Looking for credentials at: ' + sourceCredentials);
      
      if (fs.existsSync(sourceCredentials)) {
        fs.copyFileSync(sourceCredentials, destCredentials);
        logToFile('[Electron] Google Vision credentials copied to: ' + destCredentials);
      } else {
        // Fallback to __dirname
        sourceCredentials = path.join(__dirname, 'google-vision-credentials.json');
        logToFile('[Electron] Trying __dirname location: ' + sourceCredentials);
        if (fs.existsSync(sourceCredentials)) {
          fs.copyFileSync(sourceCredentials, destCredentials);
          logToFile('[Electron] Google Vision credentials copied (__dirname) to: ' + destCredentials);
        } else {
          logToFile('[Electron] ERROR: Google Vision credentials NOT FOUND');
          logToFile('[Electron] Searched in:');
          logToFile('[Electron]   - ' + path.join(app.getAppPath(), 'google-vision-credentials.json'));
          logToFile('[Electron]   - ' + sourceCredentials);
        }
      }
      
      // Copy server.modular.js to temp
      const sourceServerJS = path.join(__dirname, 'server.modular.js');
      const destServerJS = path.join(tempDir, 'server.modular.js');
      if (fs.existsSync(sourceServerJS)) {
        fs.copyFileSync(sourceServerJS, destServerJS);
        serverPath = destServerJS;
        cwd = tempDir;
        logToFile('[Electron] Server.modular.js extracted to: ' + destServerJS);
      }
      
      // Copy data directory to temp if it exists
      const sourceData = path.join(__dirname, 'data');
      const destData = path.join(tempDir, 'data');
      if (fs.existsSync(sourceData) && !fs.existsSync(destData)) {
        copyDirSync(sourceData, destData);
        logToFile('[Electron] Data extracted to: ' + destData);
      }
      
      // Copy node_modules to temp if it exists
      const sourceModules = path.join(__dirname, 'node_modules');
      const destModules = path.join(tempDir, 'node_modules');
      if (fs.existsSync(sourceModules) && !fs.existsSync(destModules)) {
        logToFile('[Electron] Copying node_modules to temp...');
        copyDirSync(sourceModules, destModules);
        logToFile('[Electron] node_modules extracted to: ' + destModules);
      }
    }
    
    logToFile('[Electron] Server path: ' + serverPath);
    logToFile('[Electron] Server exists: ' + fs.existsSync(serverPath));
    logToFile('[Electron] Working dir: ' + cwd);
    
    // Use port 3001, but allow override
    const port = process.env.PORT || 3001;
    
    // Find node binary - critical for packaged app
    const nodeBinary = findNodeBinary();
    logToFile('[Electron] Using node binary: ' + nodeBinary);
    
    // Spawn server using found node binary
    logToFile('[Electron] Spawning server process...');
    
    serverProcess = spawn(nodeBinary, [serverPath], {
      cwd: cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: port,
        NODE_PATH: cwd + ':' + path.join(cwd, 'node_modules')
      }
    });

    // Log server output
    let serverReady = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      logToFile('[Server stdout] ' + output.trim());
      
      // Check if server is ready (look for either format)
      if (!serverReady && (output.includes('[Server Ready]') || output.includes('listening') || output.includes('port'))) {
        serverReady = true;
        logToFile('[Electron] Server is ready on port ' + port);
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      logToFile('[Server stderr] ' + output.trim());
      
      // If port is in use, continue anyway (user might be running server manually)
      if (output.includes('EADDRINUSE')) {
        logToFile('[Electron] Port ' + port + ' already in use, continuing...');
        if (!serverReady) {
          serverReady = true;
          resolve();
        }
      }
    });

    serverProcess.on('error', (err) => {
      logToFile('[Electron] Server spawn error: ' + err.message);
      // Don't reject, continue anyway
      if (!serverReady) {
        serverReady = true;
        resolve();
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!serverReady) {
        logToFile('[Electron] Server startup timeout, proceeding anyway...');
        serverReady = true;
        resolve();
      }
    }, 5000);
  });
}

// Setup IPC handlers for folder picker
ipcMain.handle('select-folder', async (event) => {
  try {
    logToFile('[IPC] select-folder handler called');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select a folder'
    });
    logToFile('[IPC] select-folder result: ' + JSON.stringify(result));
    return result;
  } catch (err) {
    logToFile('[IPC] select-folder error: ' + err.message);
    throw err;
  }
});

// Create the browser window
function createWindow() {
  logToFile('[Electron] Creating browser window...');
  
  const preloadPath = path.join(__dirname, 'preload.js');
  
  logToFile('[Electron] Preload path: ' + preloadPath);
  logToFile('[Electron] Preload exists: ' + fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandboxed: true,
      webSecurity: false  // Allow file:// to access http://localhost (safe in packaged app)
    }
  });

  // Load Angular app
  const prodBuildPath = path.join(__dirname, 'dist/novel-ai-reviewer/index.html');
  const prodBuildExists = fs.existsSync(prodBuildPath);
  
  // Prefer production build if it exists, otherwise use dev server
  const useProductionBuild = prodBuildExists || !isDev;
  
  let startURL;
  if (useProductionBuild && prodBuildExists) {
    // Use file:// protocol for production build with hash routing
    startURL = `file://${prodBuildPath}`;
  } else {
    // Use dev server
    startURL = 'http://localhost:4200';
  }

  logToFile('[Electron] Production build exists: ' + prodBuildExists);
  logToFile('[Electron] Using production build: ' + useProductionBuild);
  logToFile('[Electron] Loading URL: ' + startURL);
  
  mainWindow.loadURL(startURL).catch(err => {
    logToFile('[Electron] Failed to load URL: ' + err.message);
    
    // If URL fails and we haven't tried production build yet, try it
    if (!useProductionBuild && prodBuildExists) {
      logToFile('[Electron] Dev server failed, falling back to production build...');
      const fallbackURL = `file://${prodBuildPath}`;
      mainWindow.loadURL(fallbackURL).catch(err2 => {
        logToFile('[Electron] Failed to load production build: ' + err2.message);
        // Show blank page with error info
        mainWindow.webContents.loadURL('about:blank');
        mainWindow.webContents.executeJavaScript(`
          document.body.style.color = 'white';
          document.body.style.backgroundColor = '#333';
          document.body.innerHTML = '<h1>Failed to load application</h1><p>Error: ${err2.message}</p>';
        `);
      });
    }
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event handlers
app.on('ready', async () => {
  console.log('[Electron] App ready event triggered');
  
  try {
    // Start server first
    await startServer();
    console.log('[Electron] Server startup complete');
    
    // Then create window
    createWindow();
    console.log('[Electron] Window created successfully');
  } catch (err) {
    console.error('[Electron] Error during startup:', err);
    // Continue anyway - server might already be running
    createWindow();
  }
});

app.on('window-all-closed', () => {
  console.log('[Electron] All windows closed');
  
  // Kill server process
  if (serverProcess) {
    console.log('[Electron] Killing server process...');
    serverProcess.kill();
  }
  
  app.quit();
});

app.on('activate', () => {
  console.log('[Electron] App activated');
  
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Electron] Uncaught exception:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Electron] SIGTERM received, shutting down...');
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});

console.log('[Electron] Module loaded, waiting for app ready event...');
