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
│           └───────────────────────►│ server.modular.js   │     │
│            localhost:3001          │ (Express Server)    │     │
│                                    │ port 3001           │     │
│                                    │                     │     │
│                                    │ - 11 route modules  │     │
│                                    │ - 49 endpoints      │     │
│                                    │ - Services layer    │     │
│                                    │ - Utils             │     │
│                                    └──────────┬──────────┘     │
│                                               │                  │
│                                    ┌──────────▼──────────┐     │
│                                    │   Local Storage     │     │
│                                    │                     │     │
│                                    │  - .reviews.json    │     │
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

**Backend Architecture Note:**
- **Current**: `server.modular.js` with clean architecture (11 route modules, services layer)
- **Legacy**: `server.js` is a monolithic file kept for reference only - NOT used by the app

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

## Electron Packaging & Distribution

### The ASAR Challenge
Electron packages apps into `.asar` archive (like a ZIP file). **Critical issue**: Node.js cannot execute `require()` from inside ASAR archives.

**Problem Flow**:
```
app.isPackaged = true
   ↓
Files bundled into app.asar
   ↓
Node tries to require() server.js from asar
   ↓
❌ FAILS: "ENOENT - cannot find module"
```

### Solution: Extract to Temp on Startup

`electron.js` handles this automatically:

1. **On app startup**:
   ```javascript
   const tempDir = path.join(app.getPath('temp'), 'novel-ai-reviewer');
   fs.rmSync(tempDir, { recursive: true, force: true });  // Clean start
   ```

2. **Copy required files to temp**:
   ```javascript
   copyDirSync(sourceServer, tempDir + '/server');
   copyDirSync(sourceModules, tempDir + '/node_modules');
   fs.copyFileSync(sourceCredentials, tempDir + '/google-vision-credentials.json');
   ```

3. **Spawn server from temp**:
   ```javascript
   spawn(nodeBinary, [tempDir + '/server.modular.js']);
   ```

Files extracted:
- `server/` - Backend code
- `node_modules/` - Dependencies
- `data/` - Local databases
- `google-vision-credentials.json` - API credentials

### Node Binary Detection

The app finds Node.js using this priority:
1. `/opt/homebrew/bin/node` (macOS ARM64)
2. `/usr/local/bin/node` (macOS Intel)
3. `/usr/bin/node` (Linux)
4. System PATH lookup

### Build Output

```bash
npm run dist:mac    # Creates .dmg installer
npm run dist:win    # Creates .exe installer
npm run dist:linux  # Creates .AppImage
```

File: `dist/Novel AI Reviewer-1.0.0-arm64.dmg` (~230 MB)



## Storage

The app uses JSON-based persistent storage for maximum portability:

### File Structure
```
~/your-image-folder/
├── image1.png
├── image2.png
├── .reviews.json           # Ratings for images in this folder
├── .ai-feedback.json       # User feedback on AI scores (learning data)
└── .prompt-mapping.json    # Cached prompt grouping
```

### Data Files
- **reviews.json**: Central file with all image ratings (path → 0-10 score)
- **.reviews.json**: Per-folder review data (stored with your images)
- **.ai-feedback.json**: User corrections and reasoning (per folder)
- **.prompt-mapping.json**: Cached prompt grouping (performance optimization)

### Storage Benefits
- ✅ Easy to backup (just copy folders)
- ✅ Version control friendly (text-based JSON)
- ✅ No database setup needed
- ✅ Ratings travel with images
- ✅ Offline operation (no cloud required)

## Services

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| ReviewsService | Save/load ratings | save(), get(), getAll() |
| ReviewsFolderService | Reviews per source folder | loadReviews(), saveReviews(), addTagToReview(), removeTagFromReview(), filterReviewsByTags() |
| TagsService | Generic tag management | getAllTags(), createTag(), deleteTag(), updateTag() |
| FileSystemService | File operations | readDirectory(), writeFile() |
| ImageMetadataService | Extract image metadata | getMetadata() |
| ImageServingService | Serve images | serveImage(), serveThumbnail() |
| VisionAnalysisService | Google Vision API analysis | analyzeImage(), analyzeQuality() |
| FolderOperationsService | Folder scanning | loadImages(), getStructure() |
| PromptGroupingService | Group by identical prompts | groupByPrompt(), getGroups() |
| ArtistGalleryService | Group by artist tag | groupByArtist(), getArtists() |
| BatchRatingService | Batch operations | startJob(), getStatus() |
| **FeedbackService** | **User corrections & learning** | **submitFeedback(), loadFeedback()** |
| RatingsService | Rating persistence | save(), load() |
| LegacyArtistGroupingService | Backward compatibility | legacyGrouping() |

### Tags System

The **TagsService** provides:
1. **Generic Tag Management**: Create, read, update, delete tags
2. **Folder-scoped Storage**: Tags stored in `.tags.json` per source folder, image-to-tag mappings in `.imageTags.json`
3. **Review Tagging**: Add/remove tags from reviews (stored in `.reviews.json`)
4. **Image Tagging**: Add/remove tags from images (stored in `.imageTags.json`), supports reviews, artist-gallery, and prompt-grouping
5. **Smart Filtering**: Filter reviews/images that have ALL specified tags (AND logic)
6. **Extensibility**: Design allows tags to be applied across all features

**Tag Object** (`.tags.json`):
```json
{
  "id": "uuid",
  "name": "High Priority",
  "color": "#FF5733",
  "createdAt": "2026-03-27T12:00:00.000Z"
}
```

**Review with Tags** (`.reviews.json`):
```json
{
  "id": "review_uuid",
  "source": "artist_gallery",
  "foreign_id": "folder_name",
  "rating": { /* ... */ },
  "tags": ["tag_id_1", "tag_id_2"],
  "notes": "...",
  "timestamp": "2026-03-27T12:00:00.000Z"
}
```

**Image Tags** (`.imageTags.json`):
```json
{
  "image1.png": ["tag_id_1", "tag_id_2"],
  "subfolder/image2.png": ["tag_id_1"],
  "image3.png": []
}
```

**Data Flow - Review Tagging**:
```
User creates tag "High Priority"
   ↓
POST /api/tags/create → TagsService.createTag() → writes to .tags.json
   ↓
User assigns tag to review in ReviewsTableComponent
   ↓
POST /api/tags/reviews/:id/add/:tagId → ReviewsFolderService.addTagToReview() → updates .reviews.json
   ↓
User filters reviews by tags in table
   ↓
GET /api/tags/reviews/filter?tags=tag_id_1 → ReviewsFolderService.filterReviewsByTags() → returns matching (AND logic)
```

**Data Flow - Image Tagging** (new):
```
User opens ImageViewerModal (in reviews-table, artist-gallery, or prompt-grouping)
   ↓
ImageViewerModalComponent loads available tags
   ↓
GET /api/tags/list?sourcePath=... → TagsService.getAllTags()
   ↓
ImageTagsComponent displays current image tags
   ↓
GET /api/tags/images/get-tags → TagsService.getImageTags() → reads from .imageTags.json
   ↓
User adds/removes tag from image
   ↓
POST/DELETE /api/tags/images/add-tag or remove-tag
   ↓
TagsService.addTagToImage() or removeTagFromImage() → updates .imageTags.json
   ↓
TAG persists across all features (reviews, artist-gallery, prompt-grouping)
```

### Feedback & Learning System

The **FeedbackService** enables:
1. **User Corrections**: Users adjust AI scores they disagree with
2. **Reasoning**: Explain why the adjustment was made
3. **Component-level Feedback**: Correct specific analysis aspects
4. **Pattern Learning**: System learns from corrections to improve future scores
5. **Persistence**: Feedback stored in `.ai-feedback.json` per folder

**Data Flow**:
```
User rates image → AI gives score (7/10)
   ↓
User sees score → Disagrees (wants 8/10)
   ↓
User submits feedback with reasoning
   ↓
FeedbackService saves to .ai-feedback.json
   ↓
VisionAnalysisService reads feedback
   ↓
Applies learned patterns to future analyses
```

## Electron IPC Communication

The app uses Electron's IPC (Inter-Process Communication) for secure communication between Angular (renderer) and Electron main process.

### Folder Picker (IPC Example)
```
Frontend (Angular)
   ↓
ipcRenderer.invoke('select-folder')
   ↓ IPC Channel
Electron Main
   ↓ (shows native file dialog)
ipcMain.handle('select-folder', callback)
   ↓
Returns: { canceled: false, filePaths: [...] }
   ↓
Frontend receives selected folder path
```

### Security Configuration
**Important**: The app sets `webSecurity: false` in BrowserWindow:
```javascript
mainWindow = new BrowserWindow({
  webPreferences: {
    webSecurity: false  // Allow file:// access to http://localhost
  }
});
```

This is required because:
- Frontend loads via `file://` protocol (from packaged app)
- Backend runs on `http://localhost:3001`
- By default, browser blocks cross-protocol requests
- **Safe here** because localhost is trusted internal communication



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
