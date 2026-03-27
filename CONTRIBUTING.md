# Contributing Guide

## API Endpoints Overview

The app implements **49 endpoints** across 11 route modules:

| Module | Purpose | Key Endpoints |
|--------|---------|--------------|
| Vision Analysis | AI image quality scoring | `POST /api/analyze-illustration` (single image) |
| Ratings | Unified ratings storage | `GET /api/ratings/load`, `POST /api/ratings/save` |
| Batch Rating | Batch AI analysis with job tracking | `POST /api/batch-rating/submit`, `GET /api/batch-rating/status/:jobId`, etc. (5 endpoints) |
| Artist Gallery | Group by artist with ratings | `POST /api/artist-gallery/load-groups`, `GET /api/artist-gallery/image`, etc. (7 endpoints) |
| Prompt Grouping | Group by identical prompts | `POST /api/prompt-grouping/load-groups`, `GET /api/prompt-grouping/progress`, etc. (7 endpoints) |
| Feedback System | AI learning from user corrections | `POST /api/feedback/submit`, `GET /api/feedback/analysis`, `GET /api/feedback/list`, etc. (6 endpoints) |
| Reviews Folder | Detailed review storage & management | `GET /api/reviews-folder/list`, `POST /api/reviews-folder/create`, etc. (6 endpoints) |
| Folder Operations | System file operations | `POST /api/pick-folder`, `POST /api/open-folder`, `POST /api/open-file` |
| Image Serving | Serve image files | `GET /api/images/:folder/:file` |
| Image Metadata | Image metadata retrieval | `GET /api/image-metadata/:folder/:filename` |
| Legacy API | Artist grouping (ReviewService) | `POST /api/group-by-artists/:folder`, `POST /api/group-by-artists-path` |

**Note**: `POST /api/batch-analyze-illustrations` is deprecated - use Batch Rating API instead.

See [API.md](./API.md) for complete endpoint documentation with request/response examples.



### Prerequisites
- Node.js 20+
- npm or yarn
- Google Cloud Vision API credentials (for AI analysis)

### Clone and Install

```bash
git clone <repository>
cd novel-ai-reviewer
npm install
```

### Add Google Vision Credentials

Create `google-vision-credentials.json` in project root:

```bash
# Copy from your Google Cloud Console
cp ~/Downloads/google-vision-credentials.json .
```

### Start Development Server

```bash
# Terminal 1: Start Angular frontend (dev server on 4200)
npm run start

# Terminal 2: Start Express backend (on port 3001)
npm run start:server

# Terminal 3: Start Electron (connects both together)
npm run electron
```

Or use the convenience script:
```bash
npm run dev  # Starts all three
```

---

## Project Structure

```
novel-ai-reviewer/
├── src/                      # Angular frontend
│   ├── app/
│   │   ├── components/      # UI components
│   │   ├── services/        # HTTP services
│   │   ├── app-routing.module.ts
│   │   └── app.component.ts
│   ├── assets/
│   ├── styles.css
│   └── main.ts
│
├── server/                   # ✅ CURRENT: Express backend (modular, clean architecture)
│   ├── routes/              # HTTP endpoints (Route Layer) - 11 modules
│   ├── services/            # Business logic (Service Layer) - pure functions
│   ├── utils/               # Shared utilities (Utility Layer)
│   └── middleware/
│
├── electron.js              # Electron main process
├── preload.js               # Electron security bridge
├── server.modular.js        # ✅ CURRENT: Express server entry point
├── server.js                # ⚠️ LEGACY: Monolithic backend (reference only, not used)
├── package.json
└── tsconfig.json
```

---

**Architecture Note:**
- `server.modular.js` is the currently active backend (started by Electron)
- `server.js` is a legacy monolithic file kept for reference only
- **Always add new features to `server/routes/` and `server/services/`, never to `server.js`**

## Adding a New Feature

**Important**: The app uses a **modularized architecture** with clean separation of concerns.
- ❌ **Do NOT** add code to `server.js` (legacy monolithic file)
- ✅ **DO** follow the modular pattern: Service → Route

### Step 1: Create a Service

Services contain pure business logic with no HTTP code.

**File**: `server/services/MyFeatureService.js`

```javascript
const logger = require('../utils/logger');

class MyFeatureService {
  constructor(dataPath) {
    this.dataPath = dataPath;
  }
  
  // Pure business logic - testable, no req/res
  doSomething(data) {
    logger.info('MyFeatureService', 'Starting operation');
    
    // Validate
    if (!data.name) {
      throw new Error('Name is required');
    }
    
    // Business logic
    const result = {
      ...data,
      processedAt: new Date()
    };
    
    logger.info('MyFeatureService', 'Operation complete');
    return result;
  }
}

module.exports = MyFeatureService;
```

### Step 2: Create Routes

Routes handle HTTP requests and call services.

**File**: `server/routes/myFeatureRoutes.js`

```javascript
const express = require('express');
const logger = require('../utils/logger');

function createMyFeatureRoutes(myFeatureService) {
  const router = express.Router();
  
  // POST /api/my-feature/do-something
  router.post('/do-something', (req, res) => {
    try {
      logger.info('MyFeatureRoutes', `Request: ${JSON.stringify(req.body)}`);
      
      // Call service
      const result = myFeatureService.doSomething(req.body);
      
      // Respond
      res.json({ success: true, result });
    } catch (err) {
      logger.error('MyFeatureRoutes', `Error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });
  
  return router;
}

module.exports = createMyFeatureRoutes;
```

### Step 3: Wire Up in server.modular.js

```javascript
// Add import
const MyFeatureService = require('./server/services/MyFeatureService');
const createMyFeatureRoutes = require('./server/routes/myFeatureRoutes');

// Add instance
const myFeatureService = new MyFeatureService(path.join(DATA_DIR, 'my-feature.json'));

// Add routes
app.use('/api/my-feature', createMyFeatureRoutes(myFeatureService));
```

### Step 4: Create Frontend Service

**File**: `src/app/services/my-feature.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MyFeatureService {
  private apiUrl = 'http://localhost:3001/api/my-feature';
  
  constructor(private http: HttpClient) {}
  
  doSomething(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/do-something`, data);
  }
}
```

### Step 5: Use in Component

```typescript
export class MyComponent {
  constructor(private myFeatureService: MyFeatureService) {}
  
  onAction() {
    this.myFeatureService.doSomething({ name: 'test' })
      .subscribe(
        result => console.log('Success', result),
        error => console.error('Error', error)
      );
  }
}
```

---

## Code Style Guidelines

### Services
- ✅ Pure functions (same input = same output)
- ✅ Validate input
- ✅ Log important operations
- ✅ Throw errors for invalid states
- ❌ No Express/HTTP code
- ❌ No req/res objects

### Routes
- ✅ Validate request format
- ✅ Call service
- ✅ Return consistent JSON
- ✅ Handle errors gracefully
- ❌ No business logic
- ❌ No database access directly

### Frontend
- ✅ Use typed services
- ✅ Handle errors and loading states
- ✅ Unsubscribe from observables
- ✅ Show user feedback

### Logging
```javascript
// Always include context tag
logger.info('ServiceName', 'Message describing action');
logger.error('ServiceName', 'Error message', error);

// In frontend/components
console.log('[ComponentName]', 'Message');
```

---

## Testing

### Test a Service

```javascript
// test/myFeatureService.test.js
const MyFeatureService = require('../server/services/MyFeatureService');

describe('MyFeatureService', () => {
  let service;
  
  beforeEach(() => {
    service = new MyFeatureService('./test-data.json');
  });
  
  test('should do something', () => {
    const result = service.doSomething({ name: 'test' });
    expect(result.name).toBe('test');
    expect(result.processedAt).toBeDefined();
  });
});
```

### Test an API Endpoint

```javascript
// test/myFeatureRoutes.test.js
const request = require('supertest');
const app = require('../server.modular');

describe('GET /api/my-feature', () => {
  test('should return data', async () => {
    const res = await request(app)
      .post('/api/my-feature/do-something')
      .send({ name: 'test' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

Run tests:
```bash
npm test
```

---

## Building

### Development Build
```bash
npm run build:app      # Angular only
npm run build:electron # Electron only
```

### Production Build
```bash
npm run dist:mac       # macOS DMG
npm run dist:win       # Windows installer
npm run dist:linux     # Linux AppImage
npm run dist           # All platforms
```

### Build Output
- macOS: `dist/Novel\ AI\ Reviewer-1.0.0-arm64.dmg`
- Windows: `dist/Novel AI Reviewer-1.0.0-x64.exe`
- Linux: `dist/Novel\ AI\ Reviewer-1.0.0.AppImage`

---

## Debugging

### View Logs

```bash
# macOS
cat ~/Library/Application\ Support/novel-ai-reviewer/app.log

# Follow logs in real-time
tail -f ~/Library/Application\ Support/novel-ai-reviewer/app.log
```

### Check Server Status

```bash
# Is server running?
lsof -i :3001

# Test endpoint
curl http://localhost:3001/health

# Check port in use
netstat -an | grep 3001
```

### Electron DevTools

In dev mode, DevTools open automatically. In production, enable with:

```javascript
// In electron.js, uncomment:
mainWindow.webContents.openDevTools();
```

---

## Common Issues

### Port 3001 Already in Use
```bash
# Kill the process
lsof -i :3001         # Find process ID
kill -9 <PID>         # Kill it

# Or use different port
PORT=3002 npm run start:server
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Clear build cache
rm -rf dist/ build/
npm run build:app
```

### App Won't Start
```bash
# Check logs
cat ~/Library/Application\ Support/novel-ai-reviewer/app.log | tail -50

# Kill any hanging processes
killall -9 "Novel AI Reviewer" node npm

# Rebuild from scratch
npm run dist:mac
```

---

## Pull Request Process

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes following style guidelines
3. Test your changes: `npm test`
4. Build production: `npm run build:app`
5. Commit with clear messages: `git commit -m "feat: add my feature"`
6. Push and create PR

---

## Questions?

- Check [README.md](./README.md) for overview
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Read [API.md](./API.md) for API documentation

---

**Last Updated**: March 27, 2026
