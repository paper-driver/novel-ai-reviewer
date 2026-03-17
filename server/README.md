# Server Architecture Refactoring

## Overview
This document describes the refactored server structure with better separation of concerns.

## Directory Structure

```
server/
├── server.js              # Main entry point - imports and configures all routes/services
├── routes/                # API route handlers
│   ├── ratings.js         # Rating load/save endpoints
│   ├── batch.js           # Batch rating endpoints
│   ├── feedback.js        # AI feedback endpoints
│   ├── illustrations.js   # Image analysis endpoints
│   └── folders.js         # Folder discovery endpoints
├── services/              # Business logic
│   ├── ratingService.js       # Load/save/merge ratings
│   ├── batchRatingService.js  # Batch processing logic
│   ├── aiFeedbackService.js   # Feedback handling
│   ├── folderService.js       # Folder operations
│   └── illustrationService.js # Image analysis
├── utils/                 # Utility functions
│   ├── logger.js          # Logging utility
│   ├── fileUtils.js       # File I/O helpers
│   └── pathUtils.js       # Path manipulation helpers
└── middleware/            # Express middleware
    └── errorHandler.js    # Error handling middleware
```

## Module Dependencies

### Rating Service
- **Exports:** `loadRatings()`, `saveRatings()`, `mergeRatings()`
- **Dependencies:** `fileUtils`
- **Used by:** All endpoints that need to read/write ratings

### Batch Rating Service  
- **Exports:** `processBatchJob()`, `getBatchProgress()`, `submitBatchJob()`
- **Dependencies:** `illustrationService`, `aiFeedbackService`, `ratingService`, `logger`
- **Used by:** Batch rating routes

### AI Feedback Service
- **Exports:** `submitFeedback()`, `loadFeedback()`, `calculateLearnedPatterns()`
- **Dependencies:** `fileUtils`, `logger`
- **Used by:** Feedback routes, batch service

### Folder Service
- **Exports:** `discoverFolders()`, `scanDirectory()`, `getPromptGroups()`
- **Dependencies:** `fileUtils`, `logger`
- **Used by:** Folder routes

### Illustration Service
- **Exports:** `analyzeIllustration()`, `analyzeImageQualityLocal()`, `extractComponents()`
- **Dependencies:** `logger`
- **Used by:** Illustration routes, batch service

## Migration Guide

### Before
```javascript
// All code in server.js (4456 lines)
app.get('/api/path', (req, res) => {
  // Business logic mixed with route handling
});
```

### After
```javascript
// server.js (simplified)
const ratingsRoutes = require('./routes/ratings');
app.use('/api', ratingsRoutes);

// routes/ratings.js
router.get('/ratings', (req, res) => {
  // Route handling only
  const service = require('../services/ratingService');
  const result = service.loadRatings(req.query.path);
});

// services/ratingService.js
function loadRatings(folderPath) {
  // Pure business logic
  const fs = require('fs');
  // Implementation
}
```

## Testing Checklist

After refactoring, verify these endpoints still work:
- [ ] Artist Gallery: Load/Save/Delete ratings
- [ ] Prompt Grouping: Load/Save/Delete ratings  
- [ ] Batch Rating: Submit job, get progress, get results
- [ ] AI Feedback: Submit feedback, get corrections
- [ ] Image Analysis: Analyze single image
- [ ] Folder Discovery: Get prompt groups, get folders
- [ ] File Operations: Create files, read directory structure

## Important Notes

1. **No code deletion** - All existing functionality is preserved
2. **Backward compatibility** - API endpoints remain unchanged
3. **Error handling** - Errors are logged but don't break the application
4. **State management** - Batch jobs, cache, and state are properly preserved
5. **Logging** - Existing console.log statements converted to logger calls

## Next Steps

1. Extract rating service → Test rating endpoints
2. Extract batch service → Test batch endpoints
3. Extract feedback service → Test feedback endpoints
4. Extract folder service → Test folder endpoints
5. Extract illustration service → Test analysis endpoints
6. Consolidate routes → Update main server.js
7. Full integration test
