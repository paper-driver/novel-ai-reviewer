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
- **AI Quality Analysis**: Get automated quality scores (0-10) for illustrations
- **Batch Operations**: Rate multiple images at once
- **Cross-platform**: macOS (ARM64), Windows, Linux
- **Offline-first**: All data stored locally

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

All endpoints available at `http://localhost:3001`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Server health check |
| POST | `/api/reviews/save` | Save image ratings |
| GET | `/api/reviews/get` | Retrieve ratings |
| POST | `/api/analyze-illustration` | Get AI quality score |
| GET | `/api/images` | List images in folder |

See [API.md](./API.md) for detailed documentation.

## Desktop App Issues

### Port 3001 Not Responding
- Check logs: `~/Library/Application Support/novel-ai-reviewer/app.log`
- Kill processes: `killall -9 "Novel AI Reviewer" node`
- Rebuild: `npm run dist:mac`

### Server Won't Start
- Ensure Node.js is installed: `which node`
- Check app logs for error messages
- Verify port 3001 is free: `lsof -i :3001`

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
