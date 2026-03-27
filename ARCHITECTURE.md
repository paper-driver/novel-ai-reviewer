# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESKTOP APP (Electron)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────┐              ┌─────────────────────┐     │
│  │  Angular Frontend  │              │  Electron Main Proc │     │
│  │  (TypeScript)      │◄────────────►│  (Node.js)          │     │
│  │                   │       IPC     │                     │     │
│  │  - Components     │              │  - Server spawn     │     │
│  │  - Services       │              │  - File dialogs     │     │
│  │  - Routes         │              │  - Window manage    │     │
│  └───────────────────┘              └─────────────────────┘     │
│           │                                                       │
│           │ HTTP                   ┌─────────────────────┐     │
│           └───────────────────────►│   Express Server    │     │
│            localhost:3001          │   (port 3001)       │     │
│                                    │                     │     │
│                                    │  - API routes       │     │
│                                    │  - Services         │     │
│                                    │  - Vision AI        │     │
│                                    │  - File operations  │     │
│                                    └──────────┬──────────┘     │
│                                               │                  │
│                                    ┌──────────▼──────────┐     │
│                                    │   Local Storage     │     │
│                                    │                     │     │
│                                    │  - reviews.json     │     │
│                                    │  - folder .reviews  │     │
│                                    └─────────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ (Packaged only)
                            ▼
                ┌─────────────────────────────┐
                │  Google Cloud Vision API    │
                │  (External - AI Analysis)   │
                └─────────────────────────────┘
```

## Layers

### 1. Frontend Layer (Angular/TypeScript)
**Location**: `src/app/`

Components:
- `app.component` - Main root
- `artist-gallery.component` - Artist grouping view
- `prompt-grouping.component` - Prompt grouping view
- `image-browser.component` - Image display
- `rating-control.component` - Rating input (0-10)

Services:
- `image.service` - Image metadata
- `rating.service` - Save/get ratings
- `analysis.service` - AI quality analysis
- `folder.service` - Folder selection (IPC)

### 2. Electron Layer (Node.js)
**Location**: `electron.js`, `preload.js`

Responsibilities:
- Spawn Node.js server process
- Create browser window
- Handle IPC events (folder picker)
- Manage app lifecycle
- Extract files from ASAR archive (packaged)

**Critical**: In packaged app, all server files are extracted to OS temp directory because Node.js cannot execute require() from inside ASAR archive.

### 3. Backend Layer (Express/Node.js)
**Location**: `server/routes/`, `server/services/`

#### Clean Architecture Pattern:
```
Routes (HTTP)
   ↓
Services (Business Logic - pure functions)
   ↓
Utils (Logging, File System)
```

**Routes**: Handle HTTP requests, call services
```javascript
router.post('/api/analyze-illustration', async (req, res) => {
  const result = await visionService.analyzeImage(req.body.imagePath);
  res.json(result);
});
```

**Services**: Pure business logic, testable
```javascript
class VisionAnalysisService {
  async analyzeImage(imagePath) {
    // No req/res objects here
    // Just pure business logic
    return { score: 8, confidence: 0.92 };
  }
}
```

**Utils**: Shared helper functions
- `logger.js` - Structured logging
- `fileSystemService.js` - File operations

## Data Flow

### Load Images
```
Frontend: User clicks "Add Folder"
   ↓ IPC: select-folder
Electron: Dialog shows folder picker
   ↓ IPC: Returns selected path
Frontend: HTTP POST /api/images with path
   ↓
Service: Scans folder, extracts metadata
   ↓
Database: Saves image list & metadata
   ↓ HTTP Response
Frontend: Displays organized views
```

### Rate Image
```
Frontend: User sets rating (0-10)
   ↓ HTTP POST: /api/reviews/save
Service: Validates rating, saves to JSON
   ↓
File System: Updates reviews.json
   ↓ HTTP Response: { success: true }
Frontend: UI updates, mark as saved
```

### AI Analysis
```
Frontend: User clicks "Analyze"
   ↓ HTTP POST: /api/analyze-illustration
Backend: Loads Google Vision credentials
   ↓
Google Cloud Vision API: Analyzes image
   ↓
Service: Processes response, calculates score
   ↓ HTTP Response: { score: 8, confidence: 0.92 }
Frontend: Displays result
```

## Packaged App Challenges

### Problem: ASAR Archive
Electron builder packages app into `.asar` archive. Node.js **cannot execute require()** from inside ASAR.

### Solution: Extract to Temp
On startup, `electron.js` extracts files to OS temp:
```javascript
const tempDir = path.join(app.getPath('temp'), 'novel-ai-reviewer');

// Copy server, node_modules, and credentials to temp
copyDirSync(sourceServer, destServerDir);
copyDirSync(sourceModules, destModules);
fs.copyFileSync(sourceCredentials, destCredentials);

// Run server from temp directory
serverProcess = spawn(nodeBinary, [destServerJS]);
```

Files extracted:
- `server/` - Express routes and services
- `node_modules/` - All dependencies
- `data/` - Local databases
- `google-vision-credentials.json` - API credentials

Temp directory is **cleared on each startup** to ensure fresh extraction.

## Storage

- **reviews.json**: Central image ratings file (path → 0-10 score)
- **.reviews.json**: Per-folder review data stored alongside images
- All data persisted as plain JSON for easy backup and portability

## Services

| Service | Purpose |
|---------|---------|
| ReviewsService | Save/load ratings |
| FileSystemService | File operations |
| ImageMetadataService | Extract image metadata |
| ImageServingService | Serve images to frontend |
| VisionAnalysisService | Google Vision AI analysis |
| FolderOperationsService | Folder scanning |
| PromptGroupingService | Group images by prompt |
| ArtistGalleryService | Group images by artist |
| BatchRatingService | Batch operations |

## Build Pipeline

1. **Angular Build** (`npm run build:app`)
   - Compiles TypeScript → JavaScript
   - Bundles with Webpack
   - Outputs to `dist/novel-ai-reviewer/`

2. **Electron Build** (`npm run dist:mac`)
   - Calls electron-builder
   - Packages app into ASAR archive
   - Bundles with Electron runtime
   - Creates DMG installer

3. **Distribution**
   - `dist/Novel AI Reviewer-1.0.0-arm64.dmg` - macOS installation
   - User mounts DMG and drags app to /Applications

---

**Last Updated**: March 27, 2026
