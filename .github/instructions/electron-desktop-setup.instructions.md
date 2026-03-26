---
name: electron-desktop-setup
description: "Use when: setting up Electron for desktop app packaging, building production desktop apps for Windows/macOS/Linux, or integrating Angular + Node.js backend into Electron"
applyTo:
  - electron.js
  - electron-main.js
  - package.json
  - src-electron/**
---

# Electron Desktop App Setup

## Overview

This instruction file guides the production-ready Electron setup for Novel AI Reviewer. The goal is to package the Angular frontend + Node.js backend (`server.modular.js`) as a distributable desktop application for Windows, macOS, and Linux.

## Architecture

```
┌─────────────────────────────────────┐
│      Electron Main Process          │
│  (electron.js)                      │
│  - Spawn Node.js server             │
│  - Create BrowserWindow             │
│  - Handle app lifecycle             │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
    Angular      Node.js
    Frontend     Backend
    (dist/)      (server.modular.js)
    :localhost   - File operations
    :4200        - Reviews API
                 - Gallery API
```

## Implementation Steps

### Step 1: Install Electron Dependencies

```bash
npm install --save-dev electron electron-builder
```

**Why these packages?**
- `electron`: Framework for running Chromium + Node.js
- `electron-builder`: Handles packaging for all platforms

### Step 2: Create Electron Main Process

**File**: `electron.js` (root of project)

**Purpose**: 
- Starts the Node.js backend server (`server.modular.js`)
- Creates Electron window
- Loads Angular app (from dist/ or dev server)
- Manages app lifecycle (start/stop/quit)

**Key responsibilities**:
- Spawn server process on app launch
- Wait for server to be ready (port 5000)
- Load Angular from built dist/ or dev server
- Kill server process when app closes
- Handle any uncaught errors

### Step 3: Create Preload Script (Security)

**File**: `preload.js` (root of project)

**Purpose**: 
- Bridge between Electron main process and Angular frontend
- Exposes safe APIs to renderer process
- Prevents direct Node.js access (security)

**Example exports**:
- App version info
- Safe IPC for folder picker
- App lifecycle events

### Step 4: Update package.json

**Add fields**:
- `main`: Points to `electron.js`
- `homepage`: Points to `/` for routing
- `build`: Electron-builder configuration
- Scripts for dev, prod, packaging

**Key scripts**:
- `electron`: Run dev (Angular + server + Electron)
- `build`: Build Angular for production
- `dist`: Build Angular + create desktop apps
- `dist:mac`, `dist:win`, `dist:linux`: Platform-specific builds

### Step 5: build/ Directories

**Directory**: `build/` (root)

**Purpose**: Store app icons and installer assets
- `build/icon.png`: App icon (512x512)
- `build/icon.ico`: Windows icon
- `build/icon.icns`: macOS icon

### Step 6: Server Configuration

**File**: `server.modular.js`

**Changes needed**:
- Listen on `localhost:5000` (not all interfaces)
- Add startup logging to help Electron know when ready
- Graceful shutdown on SIGTERM
- Handle CORS properly (Electron loads from file://)

**Example**:
```javascript
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`[Server Ready] http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
```

### Step 7: Angular Configuration

**File**: `angular.json`

**Changes**:
- Build output to `dist/`
- Routing: Ensure `index.html` fallback for hash routing

**Tests**:
```bash
npm run build
# Verify dist/ folder contains index.html
```

## Development Workflow

### Running in Development

```bash
# Terminal 1: Start Electron (will run server + Angular automatically)
npm run electron
```

OR for faster iteration:

```bash
# Terminal 1: Development server
ng serve

# Terminal 2: Electron (points to localhost:4200)
npm run electron:dev
```

### Testing Before Build

```bash
# Build Angular prod bundle
npm run build

# Test with Electron using prod build
npm run electron:prod
```

## Production Build

### Building for Desktop

```bash
# Complete build: Angular + Electron packaging
npm run dist

# Platform-specific:
npm run dist:mac     # Creates .dmg
npm run dist:win     # Creates .exe
npm run dist:linux   # Creates AppImage
```

### Output Files

After `npm run dist`:
```
dist/Novel AI Reviewer 1.0.0.dmg       (macOS)
dist/Novel AI Reviewer Setup 1.0.0.exe (Windows)
dist/novel-ai-reviewer-1.0.0.AppImage  (Linux)
dist/unpacked/                         (Unpackaged files)
```

## Configuration Details

### Electron Builder (package.json)

```json
{
  "build": {
    "appId": "com.novelaireviewer.app",
    "productName": "Novel AI Reviewer",
    "directories": {
      "buildResources": "build",
      "output": "dist"
    },
    "files": [
      "dist/**/*",
      "server.modular.js",
      "data/**/*",
      "package.json"
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "build/icon.icns"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "build/icon.ico"
    },
    "linux": {
      "target": ["AppImage"],
      "icon": "build/icon.png"
    }
  }
}
```

### Key Config Options

| Setting | Purpose |
|---------|---------|
| `appId` | Unique identifier (reverse DNS recommended) |
| `productName` | User-facing app name |
| `files` | What to include in the built app |
| `directories.buildResources` | Folder with icons/assets |
| `mac.target` | dmg = installer, zip = portable |
| `win.target` | nsis = installer, portable = exe |
| `linux.target` | AppImage = single executable |

## Server Startup Verification

### What electron.js Does

1. **Check if server is needed**
   ```
   Is Node backend required? → YES
   ```

2. **Spawn server process**
   ```javascript
   serverProcess = spawn('node', ['server.modular.js'])
   ```

3. **Wait for readiness** (critical!)
   ```javascript
   // Check port 5000 is listening
   setTimeout(() => { /* start Electron */ }, 2000)
   ```

4. **Load Angular**
   ```javascript
   mainWindow.loadFile('dist/index.html')
   //  OR for dev:
   mainWindow.loadURL('http://localhost:4200')
   ```

### Troubleshooting Server Startup

**Problem**: "Cannot GET /" error
- Server didn't start in time
- Increase timeout in electron.js
- Check server.modular.js has proper startup logging

**Problem**: Angular loads but network calls fail
- Angular is loading from file:// but API expects http://localhost:5000
- Check CORS in server.modular.js
- Verify server is on localhost:5000

**Problem**: Server won't start
- Check Node version (requires 16+)
- Verify server.modular.js syntax
- Test: `node server.modular.js` directly

## Deployment & Distribution

### Self-Hosting Installers

Store built files from `dist/` in S3/GitHub Releases:
- macOS: Share `.dmg` file
- Windows: Share `.exe` or use NSIS installer
- Linux: Share `.AppImage`

### Auto-Updates (Optional)

Add to electron-builder:
```json
"publish": {
  "provider": "github",
  "owner": "your-username",
  "repo": "novel-ai-reviewer"
}
```

Then in electron.js:
```javascript
autoUpdater.checkForUpdatesAndNotify();
```

## Testing Checklist

- [ ] `npm run build` succeeds
- [ ] `dist/` contains `index.html`
- [ ] `node server.modular.js` starts without errors
- [ ] `npm run electron:prod` opens window
- [ ] Angular app loads (no blank window)
- [ ] File operations work (folder picker)
- [ ] Gallery loads images
- [ ] Review form saves data
- [ ] `npm run dist` creates installer files
- [ ] Installer can be run and app launches
- [ ] App closes completely (no background processes)

## Files to Create/Modify

| File | Status | Purpose |
|------|--------|---------|
| `electron.js` | Create | Main Electron process |
| `preload.js` | Create | Secure renderer bridge |
| `package.json` | Modify | Add build config + scripts |
| `server.modular.js` | Modify | Add startup logging |
| `angular.json` | Verify | Output path correct |
| `build/icon.png` | Create | App icon (512x512) |
| `build/icon.ico` | Create | Windows icon |
| `build/icon.icns` | Create | macOS icon |

## Next Steps After Setup

1. ✅ Create electron.js with working server spawn
2. ✅ Create preload.js (even minimal)
3. ✅ Update package.json with build config
4. ✅ Create app icons in build/
5. ✅ Test with `npm run electron:prod`
6. ✅ Build with `npm run dist`
7. ✅ Test generated installers
8. ✅ Set up auto-updates (optional)

## Common Issues & Fixes

### Issue: "Cannot find module" errors
**Fix**: Ensure all required files below are in dist/ folder
```bash
npm run build && ls dist/
# Should include: index.html, main.js, runtime.js, polyfills.js
```

### Issue: App starts but shows blank window
**Fix**: 
- Check console: `mainWindow.webContents.openDevTools()`
- Verify Angular loaded to dist/
- Check CORS headers in server

### Issue: Can't build for macOS on Windows
**Fix**: Use Docker or CI/CD (GitHub Actions)
```yaml
# Build macOS on cloud, download .dmg
```

### Issue: File picker doesn't work
**Fix**: Preload script must expose IPC channel
- Angular calls: `window.electronAPI.selectFolder()`
- Preload provides: `window.electronAPI`

## References

- [Electron Official Docs](https://www.electronjs.org/docs)
- [Electron Builder Config](https://www.electron.build/)
- [Angular + Electron Template](https://github.com/maximegris/angular-electron)

---

**Status**: Ready for implementation
**Author**: Copilot
**Date**: March 26, 2026
