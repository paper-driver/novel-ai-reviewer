# Server Refactoring - Clean Architecture (Route → Service → Utility)

## Overview

The refactored server follows a clean three-layer architecture:

```
HTTP Request
    ↓
[Route Layer] - HTTP handling, validation, response formatting
    ↓
[Service Layer] - Business logic, data operations, pure functions
    ↓
[Utility Layer] - Common helpers (logger, file ops, constants)
```

## Architecture Principles

### 1. **Route Layer** (server/routes/*.js)
- **Responsibility**: HTTP concerns only
- **Contains**: 
  - Express route definitions
  - Request validation
  - Response formatting
  - Error handling for HTTP errors
- **Does NOT contain**: Business logic
- **Pattern**: `createXxxRouter(service)` → returns Express router
- **Example**:
  ```javascript
  router.post('/reviews', (req, res) => {
    // 1. Validate request
    if (!req.body.title) return res.status(400).json({ error: '...' });
    
    // 2. Call service
    const review = reviewsService.createReview(req.body);
    
    // 3. Format response
    res.status(201).json(review);
  });
  ```

### 2. **Service Layer** (server/services/*.js)
- **Responsibility**: Pure business logic
- **Contains**:
  - Core operations (create, read, update, delete)
  - Data validation
  - Calculations
  - File I/O operations
  - Business rules
- **Does NOT contain**: 
  - Express/HTTP code
  - Request/response handling
  - req/res objects
- **Pattern**: Class-based with clear methods
- **Example**:
  ```javascript
  class ReviewsService {
    createReview(data) {
      // Pure business logic
      // Validate data
      // Read file
      // Write file
      return newReview;
    }
  }
  ```

### 3. **Utility Layer** (server/utils/*.js)
- **Responsibility**: Cross-cutting concerns
- **Contains**:
  - Logger (used everywhere)
  - Constants
  - Common helpers
  - Configuration
- **Imported by**: Services and Routes
- **Pattern**: Singleton or utility object
- **Example**:
  ```javascript
  const logger = require('../utils/logger');
  logger.info('TAG', 'Message');
  ```

## File Structure

```
server/
├── utils/
│   ├── logger.js           # Logging utility (import everywhere)
│   └── constants.js        # Shared constants (TO CREATE)
│
├── services/
│   ├── reviewsService.js   # Business logic for reviews
│   ├── fileSystemService.js # Business logic for file operations
│   ├── artistGalleryService.js # (TO CREATE)
│   ├── promptGroupingService.js # (TO CREATE)
│   └── ...more services
│
├── routes/
│   ├── reviewsRoutes.js    # HTTP routes for reviews
│   ├── artistGalleryRoutes.js # (TO CREATE)
│   ├── promptGroupingRoutes.js # (TO CREATE)
│   └── ...more route modules
│
└── middleware/             # Optional: auth, error handling
```

## How It Works Together

### Example: Creating a Review

1. **HTTP Request** → `POST /api/reviews`

2. **Route Handler** (reviewsRoutes.js):
   ```javascript
   router.post('/reviews', (req, res) => {
     // ✓ Validate input
     if (!req.body.title) return res.status(400).json({ error: '...' });
     
     // ✓ Call service
     const newReview = reviewsService.createReview(req.body);
     
     // ✓ Format response
     res.status(201).json(newReview);
   });
   ```

3. **Service** (reviewsService.js):
   ```javascript
   createReview(reviewData) {
     // ✓ Business logic
     const reviews = this.readReviews();
     const nextId = calculateNextId(reviews);
     
     const newReview = {
       id: nextId,
       ...reviewData,
       createdAt: new Date()
     };
     
     // ✓ Persist
     this.writeReviews([...reviews, newReview]);
     
     // ✓ Return result
     return newReview;
   }
   ```

4. **Utilities** (logger.js):
   ```javascript
   // Used by both route and service
   logger.info('ReviewsService', `Created review: ${id}`);
   logger.info('ReviewsRoutes', `Request handled`);
   ```

## Advantages of This Structure

| Benefit | Why | Example |
|---------|-----|---------|
| **Testability** | Services are pure, no HTTP mocking needed | `reviewsService.createReview(data)` → easy to test |
| **Reusability** | Services can be used from multiple places | Same service used by routes, CLI, cron jobs |
| **Maintainability** | Each layer has single responsibility | Bug in reviews logic? Fix in reviewsService only |
| **Scalability** | Easy to add new features | Add new route + new service method |
| **Clarity** | Clear data flow | Request → Route → Service → Response |

## Current Status

✅ **Created:**
- `logger.js` - Logging utility
- `fileSystemService.js` - File operations service
- `reviewsService.js` - Reviews business logic
- `reviewsRoutes.js` - Reviews HTTP routes

🔲 **To Create (Following Same Pattern):**
- Image metadata service
- Artist gallery service + routes
- Prompt grouping service + routes
- Vision API service (for image analysis)
- Batch processing service + routes
- More utility modules as needed

## Next Steps

1. Extract more services from server.js (one domain at a time)
2. Create corresponding route modules
3. Update server-refactored.js to use them
4. Test incrementally
5. Eventually migrate from server.js to server-refactored.js

## Testing the Architecture

```javascript
// Test service directly (no HTTP)
const ReviewsService = require('./server/services/reviewsService');
const service = new ReviewsService('./data/reviews.json');
const review = service.createReview({ title: 'Test' });
console.assert(review.id > 0);

// Test route (with mock service)
const router = createReviewsRouter(mockService);
// Use supertest or similar to test HTTP
```

## Key Rules

1. ✅ Services contain business logic
2. ✅ Routes contain HTTP handling
3. ✅ Utilities contain common code
4. ❌ No Express code in services
5. ❌ No database/file calls in routes
6. ❌ No business logic in routes
7. ✅ All layers can import utilities
8. ✅ Routes import services
9. ❌ Services should NOT import routes
10. ✅ Everything imports logger

This creates a clean, maintainable, scalable backend architecture.
