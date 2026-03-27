# Open-File Endpoint Fix

## Issue Found
The `/api/open-file` endpoint was NOT revealing files in Finder on macOS. Instead, it was opening them with the default application (Preview app for images).

## Root Cause

**server.js (Original - CORRECT):**
```javascript
if (platform === 'darwin') {
  execSync(`open -R "${filePath}"`, { stdio: 'ignore' });  // ← -R flag
}
```

**server.modular.js (Buggy - WRONG):**
```javascript
if (platform === 'darwin') {
  execSync(`open "${filePath}"`, { stdio: 'ignore' });  // ✗ Missing -R flag!
}
```

## What the `-R` Flag Does

**`open -R "/path/to/file"`** 
- **R** = "Reveal"
- Opens Finder and **reveals/selects** the file in its location
- The file itself is NOT opened with the default app
- User can see the file in context of its folder

**`open "/path/to/file"`** (without -R)
- Opens the file WITH the default application
- For .png images → Opens in Preview app
- Not what we want!

## The Fix

Changed the macOS command from:
```javascript
execSync(`open "${filePath}"`, { stdio: 'ignore' });
```

To:
```javascript
// macOS - use open -R to reveal in Finder
execSync(`open -R "${filePath}"`, { stdio: 'ignore' });
```

Also updated Windows command for consistency:
```javascript
// Windows - use explorer to open folder and select file
execSync(`explorer /select,"${filePath}"`, { stdio: 'ignore', shell: 'cmd.exe' });
```

## Platform Support

| Platform | Command | Behavior |
|----------|---------|----------|
| **macOS** | `open -R "/path/file"` | Reveal in Finder |
| **Windows** | `explorer /select,"/path/file"` | Select file in Explorer |
| **Linux** | `xdg-open "/path/file"` | Open with default app |

## Testing

✅ **Test Result:**
```bash
curl -X POST http://localhost:3000/api/open-file \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/file.png"}'

Response: {"success": true, "path": "/path/to/file.png"}
Log: "Opened file: /path/to/file.png"
```

✅ **Behavior:** File is now revealed in Finder (not opened in Preview)

## Files Modified

- `/server/routes/folderOperationsRoutes.js` - Lines 90-103
  - Added `-R` flag to macOS open command
  - Aligned Windows command with server.js
  - Added Linux command for completeness

## Status

✅ **FIXED** - Now matches server.js behavior exactly
