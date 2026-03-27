# Quick Start - Clean Architecture Guide

## What You Have

A **complete, working example** of clean architecture with:

```
✅ Utility Layer      → logger.js (logging everywhere)
✅ Service Layer      → reviewsService.js (business logic)
✅ Route Layer        → reviewsRoutes.js (HTTP endpoints)
✅ Documentation      → 4 comprehensive guides
```

## The Pattern (Copy This For Every Feature)

### 1️⃣ Create a Service
**File:** `server/services/XxxService.js`

```javascript
const logger = require('../utils/logger');
const fs = require('fs');

class XxxService {
  constructor(configPath) {
    this.configPath = configPath;
  }
  
  // Business logic methods (NO Express code)
  doSomething(data) {
    // Validate
    // Calculate
    // Read/Write files
    // Use logger
    return result;
  }
}

module.exports = XxxService;
```

**Remember:**
- ✅ Pure functions
- ✅ Can call other services
- ✅ Can use logger and fileSystemService
- ✅ Can import utilities
- ❌ NO Express/HTTP code
- ❌ NO req/res objects

### 2️⃣ Create a Route
**File:** `server/routes/xxxRoutes.js`

```javascript
const express = require('express');
const logger = require('../utils/logger');

function createXxxRouter(xxxService) {
  const router = express.Router();
  
  router.post('/xxx', (req, res) => {
    try {
      // 1. Validate input
      if (!req.body.field) {
        return res.status(400).json({ error: 'field required' });
      }
      
      // 2. Call service
      const result = xxxService.doSomething(req.body);
      
      // 3. Return response
      res.json(result);
    } catch (err) {
      logger.error('XxxRoutes', err.message);
      res.status(500).json({ error: 'Failed' });
    }
  });
  
  return router;
}

module.exports = createXxxRouter;
```

**Remember:**
- ✅ HTTP handling only
- ✅ Minimal validation
- ✅ Call service for logic
- ✅ Format and return response
- ❌ NO business logic
- ❌ NO database/file calls directly

### 3️⃣ Use in server.js (or server-refactored.js)

```javascript
const XxxService = require('./server/services/XxxService');
const createXxxRouter = require('./server/routes/xxxRoutes');

// Initialize
const xxxService = new XxxService(configPath);

// Create router
const xxxRouter = createXxxRouter(xxxService);

// Mount
app.use('/api', xxxRouter);

// Now these work:
// POST /api/xxx
```

## File Locations

```
server/
├── utils/
│   ├── logger.js ← import by everyone
│   └── constants.js (to create)
│
├── services/
│   ├── reviewsService.js ✅ (example)
│   ├── fileSystemService.js ✅ (example)
│   ├── artistGalleryService.js (next)
│   ├── promptGroupingService.js (next)
│   └── ...more
│
└── routes/
    ├── reviewsRoutes.js ✅ (example)
    ├── artistGalleryRoutes.js (next)
    ├── promptGroupingRoutes.js (next)
    └── ...more
```

## Examples in This Repo

Learn from these:

1. **Logger** (utility)
   - `server/utils/logger.js` - 47 lines
   - Shows: Simple, shared, used everywhere

2. **FileSystemService** (utility service)
   - `server/services/fileSystemService.js` - 155 lines
   - Shows: Reusable file operations

3. **ReviewsService** (business logic)
   - `server/services/reviewsService.js` - 135 lines
   - Shows: Core logic, no HTTP, pure methods

4. **ReviewsRoutes** (HTTP handler)
   - `server/routes/reviewsRoutes.js` - 150 lines
   - Shows: HTTP only, calls service, returns response

## Data Flow

```
Browser Request
    ↓
Route (check input)
    ↓
Service (do business logic)
    ↓
Utilities (use logger, fileSystem)
    ↓
File/Database (persist data)
    ↓
Browser Response (JSON)
```

## Key Advantages

| Benefit | Why |
|---------|-----|
| **Testable** | Test service without Express: `new Service().method()` |
| **Reusable** | Use service in CLI, cron, other apps |
| **Maintainable** | Bug? Find it in one layer |
| **Scalable** | Add feature = repeat pattern |
| **Clear** | Anyone can understand flow |

## Testing Example

```javascript
// Test service (no HTTP needed!)
const ReviewsService = require('./server/services/reviewsService');
const service = new ReviewsService('./test/data.json');

// Directly call methods
const review = service.createReview({ title: 'Test' });
console.assert(review.id > 0, 'Should have ID');
console.assert(review.createdAt, 'Should have timestamp');

// No Express, no mocking, no complexity!
```

## Documentation to Read

1. **ARCHITECTURE.md** - Deep dive into the pattern
2. **ARCHITECTURE_VISUAL.md** - Diagrams and flows
3. **CLEAN_ARCHITECTURE_READY.md** - Implementation details
4. **This file** - Quick reference

## Ready to Extend?

Choose any feature from server.js and extract it:

### Example: Artist Gallery

1. Create `server/services/artistGalleryService.js`
   - Copy logic from server.js lines (find them first)
   - Make it a class with methods
   - Remove Express code

2. Create `server/routes/artistGalleryRoutes.js`
   - Create router function
   - Add endpoints
   - Call service methods

3. Test with:
   ```bash
   npm run start:modular
   ```

## Common Mistakes to Avoid

❌ **DON'T** put Express code in services
```javascript
// WRONG
class ReviewsService {
  create(req, res) {  // ← NO! req/res in service
    fs.writeFile(...);
    res.json(...);    // ← NO! HTTP in service
  }
}
```

✅ **DO** keep services pure
```javascript
// RIGHT
class ReviewsService {
  create(data) {      // ← Just data, no req
    fs.writeFile(...); // ← Only file ops
    return review;     // ← Just return data
  }
}
```

❌ **DON'T** put business logic in routes
```javascript
// WRONG
router.post('/reviews', (req, res) => {
  // Calculate ID
  const reviews = JSON.parse(fs.readFileSync(...));
  const nextId = reviews.length > 0 ? ... : 1;  // ← NO!
  // ... lots of logic ...
});
```

✅ **DO** delegate to service
```javascript
// RIGHT
router.post('/reviews', (req, res) => {
  const review = reviewsService.create(req.body);  // ← Simple!
  res.json(review);
});
```

## Next Steps

1. ✅ Review the example files
2. ✅ Understand the pattern
3. 🔄 Start extracting services
4. 🔄 Create routes for them
5. 🔄 Test with frontend

Ready? Let's build it! 🚀
