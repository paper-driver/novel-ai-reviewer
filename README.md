# Novel AI Reviewer

A powerful desktop application for organizing, rating, and analyzing AI-generated illustrations using Google Vision API.

## Quick Overview

**Novel AI Reviewer** is an Angular-based desktop app (built with Electron) that helps you:
- 📁 Organize images by artist tags or prompts
- ⭐ Rate illustrations (0-10 scale) with persistent storage
- 🤖 Analyze image quality using Google Vision AI
- 🔍 Search and filter your image collection
- 📊 Batch rate multiple images efficiently

## Key Features

- **Artist Gallery**: Group images by artist tags with ratings
- **Prompt Grouping**: Group images by identical prompts
- **AI Quality Analysis**: Get automated quality scores (0-10) for illustrations with detailed breakdown
- **Pattern Learning**: AI learns from your feedback to improve scoring accuracy
- **Batch Operations**: Rate multiple images at once
- **Feedback System**: Correct AI scores and help train the pattern learning system
- **Cross-platform**: macOS (ARM64), Windows, Linux
- **Offline-first**: All data stored locally

## Detailed Features

### 🎨 Image Organization
- Organize by artist (extracted from metadata)
- Group by identical prompts
- View detailed image metadata (dimensions, file size, creation date)
- Browse with ratings dashboard

### ⭐ Rating System
- Rate images on 0-10 scale
- Persistent storage (never lose ratings)
- Batch rating for efficiency
- Individual or folder-level ratings
- Rating statistics and analytics

### 🤖 AI Analysis Features
- **Google Vision API Integration**: Professional image analysis
- **Detailed Breakdown**: 
  - Sharpness & clarity
  - Composition & framing
  - Color balance
  - Component detection (objects, faces, etc.)
- **Confidence Scoring**: See how confident the AI is in its score (0-100%)
- **Pattern Learning**: System learns from corrections to improve future scores
- **Feedback Submission**: Correct AI scores and explain why (teaches the system)

### 📊 Analytics & Insights
- Rating distribution charts
- Average quality scores by artist
- Batch processing with progress tracking
- Feedback history per folder

### 💾 Data Management
- All data stored locally (no cloud sync)
- .reviews.json files in your folders
- .ai-feedback.json for correction history
- Easy backup and portability

## Getting Started

### Installation

1. **Download the DMG** (macOS):
   ```bash
   dist/Novel\ AI\ Reviewer-1.0.0-arm64.dmg
   ```
   Double-click to mount and drag the app to Applications folder.

2. **Or build from source**:
   ```bash
   npm install
   npm run dist:mac    # Build macOS DMG
   npm run dist:win    # Build Windows installer
   npm run dist:linux  # Build Linux AppImage
   ```

### Running in Development

```bash
npm run electron      # Start dev mode with live reload
npm run build:app    # Build Angular frontend only
npm run start:server # Start Node.js backend on port 3001
```

## Project Structure

```
novel-ai-reviewer/
├── src/                    # Angular frontend
│   ├── app/
│   │   ├── components/    # UI components
│   │   └── services/      # Frontend services
│   └── assets/
├── server/                # Node.js backend (clean architecture)
│   ├── services/          # Business logic (no HTTP code)
│   ├── routes/            # Express endpoints
│   └── utils/             # Shared utilities
├── electron.js            # Main Electron process
├── preload.js             # Electron security bridge
└── data/                  # Local JSON data files
```

## How It Works

### Architecture
- **Frontend**: Angular 19 + TypeScript
- **Backend**: Express.js + Node.js
- **Desktop**: Electron 41 + electron-builder
- **AI Analysis**: Google Cloud Vision API
- **Storage**: Local JSON files (reviews.json)

### Key Flows

1. **Load Images**:
   - Select folder via IPC (select-folder)
   - Server scans for images and metadata
   - Frontend displays organized views

2. **Rate Images**:
   - Set rating (0-10)
   - Saved to `reviews.json`
   - Persistent across sessions

3. **AI Analysis**:
   - Click "Analyze" button
   - Server calls Google Vision API
   - Returns quality score (0-10)
   - Shows confidence percentage

## API Endpoints

All endpoints available at `http://localhost:3001`. The app implements **49+ endpoints** across 11 route modules:

| Category | Key Endpoints |
|----------|---------------|
| Vision Analysis | `POST /api/analyze-illustration` |
| Ratings | `GET /api/ratings/load`, `POST /api/ratings/save` |
| Artist Gallery | `POST /api/artist-gallery/load-groups`, `GET /api/artist-gallery/image`, etc. (7 endpoints) |
| Prompt Grouping | `POST /api/prompt-grouping/load-groups`, `GET /api/prompt-grouping/progress`, etc. (7 endpoints) |
| Batch Rating | `POST /api/batch-rating/submit`, `GET /api/batch-rating/status/:jobId`, etc. (5 endpoints) |
| Feedback | `POST /api/feedback/submit`, `GET /api/feedback/analysis`, `GET /api/feedback/list`, etc. (6 endpoints) |
| Reviews Folder | `GET /api/reviews-folder/list`, `POST /api/reviews-folder/create`, etc. (6 endpoints) |
| Legacy API | `POST /api/group-by-artists/:folder`, `POST /api/group-by-artists-path` (Still actively used) |

See [API.md](./API.md) for complete endpoint documentation.

## Troubleshooting

### Common Issues

#### 1. API Call Fails (HTTP Status 0)
**Symptom**: "Http failure response... status 0 Unknown Error"
- **Solution**: Ensure port 3001 is free and server started
  ```bash
  lsof -i :3001
  killall -9 node  # if needed
  npm run dist:mac  # rebuild
  ```

#### 2. Server Won't Start
**Symptom**: App loads but can't reach API
- **Check logs**: `~/Library/Application Support/novel-ai-reviewer/app.log`
- **Verify Node.js**: `which node` (must return a path)
- **Try port 3001**: `curl http://localhost:3001/health`

#### 3. Google Vision API Errors
**Symptom**: "Cannot find module... google-vision-credentials.json"
- **Solution**: Ensure credentials file exists in project root:
  ```bash
  ls -la google-vision-credentials.json
  ```
- **Get credentials** from [Google Cloud Console](https://console.cloud.google.com)

#### 4. App Keeps Spawning/Crashing
**Symptom**: Multiple app instances, high CPU usage
- **Fix**: Kill all processes and rebuild:
  ```bash
  killall -9 "Novel AI Reviewer" node npm
  rm -rf dist/mac-arm64 dist/*.dmg dist/*.zip
  npm run dist:mac
  ```

#### 5. Ratings Not Saving
**Symptom**: Ratings disappear after restart
- **Solution**: Check file permissions on data folder:
  ```bash
  chmod 755 ~/Library/Application\ Support/novel-ai-reviewer/
  ```
- **Verify data files**: Look for `reviews.json` in data directory

### Getting Help

1. **Check the logs first**:
   ```bash
   tail -f ~/Library/Application\ Support/novel-ai-reviewer/app.log
   ```

2. **Common log messages**:
   - `[Electron]` - App startup
   - `[Server Ready]` - Backend started
   - `[Server stderr]` - Backend errors
   - `[IPC]` - Inter-process communication

3. **Still stuck?** Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details

## Development

### Adding a New Feature

1. **Create a Service** (business logic - no HTTP):
   ```javascript
   // server/services/MyService.js
   class MyService {
     doSomething(data) { /* ... */ }
   }
   module.exports = MyService;
   ```

2. **Create Routes** (HTTP endpoints):
   ```javascript
   // server/routes/myRoutes.js
   function createMyRoutes(myService) {
     router.post('/do-something', (req, res) => {
       const result = myService.doSomething(req.body);
       res.json(result);
     });
   }
   ```

3. **Wire it up** in `server.modular.js`:
   ```javascript
   const createMyRoutes = require('./routes/myRoutes');
   app.use('/api/my', createMyRoutes(myService));
   ```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

## Logging

The app logs to: `~/Library/Application Support/novel-ai-reviewer/app.log`

Logs include:
- Electron startup messages
- Server startup/errors
- IPC events
- API requests
- Vision analysis results

## Building & Deployment

### Build Commands
```bash
npm run build:app        # Angular production build
npm run dist:mac         # macOS DMG (ARM64)
npm run dist:mac:x64     # macOS DMG (Intel)
npm run dist:win         # Windows installer
npm run dist:linux       # Linux AppImage
```

### File Size
- DMG: ~230 MB (includes all dependencies)
- Built with electron-builder, signed ad-hoc

## Technologies

- **Angular 19.2** - Modern frontend framework
- **Electron 41** - Desktop runtime
- **Express.js** - Backend API
- **Google Cloud Vision** - AI image analysis
- **TypeScript** - Type safety
- **JSON** - Local file-based persistence

## License

Proprietary - Leon Mao

---

**Last Updated**: March 27, 2026
