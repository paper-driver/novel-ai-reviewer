# Quick Reference: Service & Route Integration

## Services Overview

### 1. Rating Service
**File**: `/server/services/ratingService.js`
```javascript
const ratingService = require('./server/services/ratingService');

// Functions available:
ratingService.loadRatings(folderPath)      // → Object
ratingService.saveRatings(folderPath, ratings) // → Object
ratingService.deleteRatings(folderPath, imagesToDelete) // → void
```

### 2. Batch Rating Service
**File**: `/server/services/batchRatingService.js`
```javascript
const batchRatingService = require('./server/services/batchRatingService');

// Functions available:
batchRatingService.initialize(deps)        // Required init
batchRatingService.processBatchJob(jobId)  // Async processing
batchRatingService.batchJobs              // Map of jobs
```

### 3. AI Feedback Service
**File**: `/server/services/aiFeedbackService.js`
```javascript
const aiFeedbackService = require('./server/services/aiFeedbackService');

// Functions available:
aiFeedbackService.setCurrentSourcePath(path)
aiFeedbackService.loadFeedback(sourcePath)
aiFeedbackService.saveFeedback(feedbackData, sourcePath)
aiFeedbackService.calculateLearnedPatterns(feedbackData)
aiFeedbackService.applyLearnedPatterns(scores, patterns)
aiFeedbackService.submitFeedback(feedbackEntry)
aiFeedbackService.analyzeFeedback(sourcePath)
```

### 4. Folder Service
**File**: `/server/services/folderService.js`
```javascript
const folderService = require('./server/services/folderService');

// Functions available:
await folderService.pickFolder()           // → Promise<{success, path}>
folderService.openFolder(folderPath)       // → boolean
folderService.getLoadingProgress(folderPath) // → Object
folderService.scanPNGFilesRecursive(folderPath) // → Array
```

### 5. Illustration Service
**File**: `/server/services/illustrationService.js`
```javascript
const illustrationService = require('./server/services/illustrationService');

// Functions available (after initialize):
illustrationService.initialize(visionClient) // Required
await illustrationService.analyzeImageQualityLocal(filePath) // → number (1-10)
illustrationService.calculateComponentScores(labels, visionResult)
illustrationService.calculateOverallScore(scores, isIllustration)
```

---

## Routes Integration in server.modular.js

### How to Initialize Routes

```javascript
// 1. Import services
const ratingService = require('./server/services/ratingService');
const batchRatingService = require('./server/services/batchRatingService');
const aiFeedbackService = require('./server/services/aiFeedbackService');
const folderService = require('./server/services/folderService');
const illustrationService = require('./server/services/illustrationService');

// 2. Import route modules
const ratingsRoutes = require('./server/routes/ratings');
const batchRoutes = require('./server/routes/batch');
const feedbackRoutes = require('./server/routes/feedback');
const foldersRoutes = require('./server/routes/folders');
const illustrationsRoutes = require('./server/routes/illustrations');

// 3. Initialize illustration service (needs visionClient)
illustrationService.initialize(visionClient);

// 4. Initialize each route with its dependencies
ratingsRoutes.initialize({ ratingService });

batchRoutes.initialize({ 
  batchRatingService,
  logger
});

feedbackRoutes.initialize({ 
  aiFeedbackService,
  currentSourcePath
});

foldersRoutes.initialize({ folderService });

illustrationsRoutes.initialize({
  illustrationService,
  aiFeedbackService,
  visionClient,
  logger,
  currentSourcePath
});

// 5. Mount routes on Express app
app.use('/api', ratingsRoutes.router);
app.use('/api', batchRoutes.router);
app.use('/api', feedbackRoutes.router);
app.use('/api', foldersRoutes.router);
app.use('/api', illustrationsRoutes.router);
```

---

## Routes Summary

### Ratings Routes (`/server/routes/ratings.js`)
```
POST   /api/artist-gallery/load-ratings          → Load ratings
POST   /api/artist-gallery/save-ratings          → Save ratings
POST   /api/artist-gallery/delete-ratings        → Delete ratings
POST   /api/prompt-grouping/load-ratings         → Load ratings
POST   /api/prompt-grouping/save-ratings         → Save ratings
POST   /api/prompt-grouping/delete-ratings       → Delete ratings
```

### Batch Routes (`/server/routes/batch.js`)
```
POST   /api/batch-rating/submit                  → Create batch job
GET    /api/batch-rating/status/:jobId           → Get job status
GET    /api/batch-rating/jobs                    → List all jobs
GET    /api/batch-rating/results/:jobId          → Get results
POST   /api/batch-rating/cancel/:jobId           → Cancel job
```

### Feedback Routes (`/server/routes/feedback.js`)
```
POST   /api/feedback/submit                      → Submit feedback
GET    /api/feedback/analysis                    → Analyze patterns
GET    /api/feedback/stats                       → Get statistics
```

### Folders Routes (`/server/routes/folders.js`)
```
POST   /api/pick-folder                          → Open file picker
POST   /api/open-folder                          → Open in explorer
```

### Illustrations Routes (`/server/routes/illustrations.js`)
```
POST   /api/analyze-illustration                 → Analyze image
```

---

## Example: Testing a Service

```javascript
// Test rating service directly
const ratingService = require('./server/services/ratingService');

const testPath = '/Users/leonmao/test-images';
try {
  const ratings = ratingService.loadRatings(testPath);
  console.log('Loaded ratings:', ratings);
  
  const newRatings = { 'image1.png': 7, 'image2.png': 8 };
  ratingService.saveRatings(testPath, newRatings);
  console.log('Saved ratings');
} catch (err) {
  console.error('Error:', err);
}
```

---

## Example: Testing a Route

```bash
# Test rating load endpoint
curl -X POST http://localhost:3000/api/artist-gallery/load-ratings \
  -H "Content-Type: application/json" \
  -d '{"folderPath": "/path/to/images"}'

# Test batch submit endpoint
curl -X POST http://localhost:3000/api/batch-rating/submit \
  -H "Content-Type: application/json" \
  -d '{
    "folderPath": "/path/to/images",
    "imageFilenames": ["img1.png", "img2.png"]
  }'

# Test feedback submit endpoint
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "image.png",
    "aiScore": 6,
    "userScore": 7,
    "components": {"anatomy": 7, "face": 8},
    "sourcePath": "/path/to/source"
  }'
```

---

## Dependency Flow

```
server.modular.js (main entry)
    │
    ├─→ initialize(visionClient)
    │       ├─→ illustrationService.initialize(visionClient)
    │       └─→ All route initialize(deps)
    │
    ├─→ Mount routes on Express
    │       ├─→ app.use('/api', ratingsRoutes.router)
    │       ├─→ app.use('/api', batchRoutes.router)
    │       ├─→ app.use('/api', feedbackRoutes.router)
    │       ├─→ app.use('/api', foldersRoutes.router)
    │       └─→ app.use('/api', illustrationsRoutes.router)
    │
    └─→ app.listen(3000)

Request flow example:
  Client → POST /api/feedback/submit
      ↓
  feedbackRoutes.router
      ↓
  feedbackRoutes.initialize() injected aiFeedbackService
      ↓
  aiFeedbackService.submitFeedback(entry)
      ↓
  aiFeedbackService.loadFeedback(sourcePath)
  aiFeedbackService.saveFeedback(data, sourcePath)
      ↓
  Response sent to client
```

---

## Important: Server Restart Required

After modifying any service or route file, you must:
1. Stop server.modular.js (Ctrl+C)
2. Restart it: `node server.modular.js`

Changes to service/route code won't be hot-loaded.

---

## Troubleshooting

### "Cannot find module" error
- Verify file paths in require() statements
- Ensure `/server` directory exists with subdirectories
- Check that all files are created in correct locations

### Routes not responding
- Verify `initialize()` was called with correct dependencies
- Check that routes are mounted with `app.use('/api', routeName.router)`
- Verify Express app is listening on correct port

### Service functions throwing errors
- Check that dependencies were injected during initialize
- Verify file paths and permissions
- Check logger output for detailed error messages

---

## Adding New Services (Future)

To add a new service:

1. Create `/server/services/newService.js`
2. Export functions with clear contracts
3. Create `/server/routes/new.js` with route handlers
4. In server.modular.js:
   ```javascript
   const newService = require('./server/services/newService');
   const newRoutes = require('./server/routes/new');
   
   newRoutes.initialize({ newService, ...dependencies });
   app.use('/api', newRoutes.router);
   ```

That's it! The modular architecture makes it easy to extend.
