# Clean Architecture - Visual Guide

## Layer Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP REQUEST                           │
│                    (from browser)                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    ROUTE LAYER                              │
│  (server/routes/reviewsRoutes.js)                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Check: Is title provided?                        │   │
│  │ 2. Extract: { title, description, images }         │   │
│  │ 3. Call: reviewsService.createReview(data)         │   │
│  │ 4. Return: res.status(201).json(result)            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  SERVICE LAYER                              │
│  (server/services/reviewsService.js)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Validate: Check if data makes sense             │   │
│  │ 2. Calculate: Get next ID, add timestamps          │   │
│  │ 3. Read: Get existing reviews from file            │   │
│  │ 4. Combine: Add new review to list                 │   │
│  │ 5. Write: Save updated reviews to file             │   │
│  │ 6. Return: New review object                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                UTILITY LAYER                                │
│  (server/utils/logger.js, fileSystemService.js)             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • logger.info('ReviewsService', 'Created review')  │   │
│  │ • fs.writeFileSync(filePath, data)                 │   │
│  │ • JSON.parse() / JSON.stringify()                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  FILE SYSTEM / DB                           │
│             (data/reviews.json file)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    HTTP RESPONSE                            │
│                (JSON back to browser)                       │
└─────────────────────────────────────────────────────────────┘
```

## Code Flow Examples

### Creating a Review

```
POST /api/reviews
│
├─ reviewsRoutes.js (HTTP handler)
│  ├─ Validate: req.body.title exists? ✓
│  ├─ Call: reviewsService.createReview({
│  │         title: "My Review",
│  │         description: "...",
│  │         images: [...]
│  │       })
│  │
│  ├─ reviewsService.js (Business logic)
│  │  ├─ this.readReviews() 
│  │  │  └─ fileSystemService.readJsonFile('data/reviews.json')
│  │  │
│  │  ├─ Calculate nextId = 5
│  │  ├─ Create object with { id: 5, title, description, images, createdAt }
│  │  │
│  │  ├─ this.writeReviews([...oldReviews, newReview])
│  │  │  └─ fileSystemService.writeJsonFile('data/reviews.json', data)
│  │  │     └─ fs.writeFileSync() ← actual file write
│  │  │
│  │  └─ return newReview
│  │
│  ├─ logger.info('ReviewsRoutes', 'Created review: 5')
│  │
│  └─ res.status(201).json(newReview)
│
└─ HTTP Response
   {
     "id": 5,
     "title": "My Review",
     "description": "...",
     "images": [...],
     "createdAt": "2026-03-16T..."
   }
```

### Getting All Reviews

```
GET /api/reviews
│
├─ reviewsRoutes.js
│  ├─ Call: reviewsService.getAllReviews()
│  │
│  ├─ reviewsService.js
│  │  ├─ this.readReviews()
│  │  │  └─ fileSystemService.readJsonFile()
│  │  │     └─ JSON.parse(fs.readFileSync())
│  │  │
│  │  └─ return [review1, review2, ...]
│  │
│  └─ res.json(reviews)
│
└─ HTTP Response
   [
     { "id": 1, "title": "...", ... },
     { "id": 2, "title": "...", ... },
     ...
   ]
```

## File Organization

```
server/                          ← All backend code

├── utils/
│   └── logger.js               ← Import by EVERYTHING
│       Provides: logger.info(), logger.error(), etc.

├── services/
│   ├── reviewsService.js       ← Pure business logic
│   │   • readReviews()
│   │   • createReview()
│   │   • deleteReview()
│   │   • NO Express code
│   │   • NO req/res objects
│   │   • Can be tested standalone
│   │
│   └── fileSystemService.js    ← Shared file operations
│       • readJsonFile()
│       • writeJsonFile()
│       • deleteFile()
│       • Used by other services

├── routes/
│   └── reviewsRoutes.js        ← HTTP endpoints
│       • createRouter(service)
│       • Imports reviewsService
│       • Handles: GET /api/reviews
│       •          POST /api/reviews
│       •          DELETE /api/reviews/:id

└── middleware/                 ← Optional: auth, errors
    (empty for now)
```

## Data Flow Directions (What Can Import What)

```
                    logger.js ← everyone imports this
                       ↑
                    (used by)
                       ↑
       ┌────────────────┴────────────────┐
       ↑                                 ↑
   reviewsService.js              reviewsRoutes.js
   (import logger,                (import logger,
    fileSystemService)             reviewsService)
       ↑
       │ (imported by)
       │
   fileSystemService.js
   (import logger only)

Rules:
✓ Services → import logger + other services
✓ Routes → import logger + services
✓ Utils → import only other utils
✗ Services → should NOT import routes
✗ Utilities → should NOT import services/routes
```

## Testing Strategy

```
Unit Test Service (No HTTP needed):
┌─────────────────────────────────┐
│ const service = new ReviewsService('./test-data.json');
│ const result = service.createReview({ title: 'Test' });
│ assert(result.id > 0);
│ assert(result.createdAt exists);
└─────────────────────────────────┘

Integration Test Route:
┌─────────────────────────────────┐
│ const mockService = { ... };
│ const router = createReviewsRouter(mockService);
│ request(router).post('/reviews')
│   .send({ title: 'Test' })
│   .expect(201);
└─────────────────────────────────┘

End-to-End Test:
┌─────────────────────────────────┐
│ npm run start:modular
│ curl http://localhost:3000/api/reviews
│ Verify full flow works
└─────────────────────────────────┘
```

## Scaling (Adding New Features)

To add **Artist Gallery** feature:

```
1. Create service:
   server/services/artistGalleryService.js
   └─ class ArtistGalleryService {
        loadGallery()
        groupByArtist()
        getArtistImage()
      }

2. Create routes:
   server/routes/artistGalleryRoutes.js
   └─ createArtistGalleryRouter(service)
      └─ router.post('/artist-gallery/load-groups')
      └─ router.post('/artist-gallery/group-images')
      └─ router.get('/artist-gallery/image')

3. Update server.js:
   const service = new ArtistGalleryService(...)
   app.use('/api', createArtistGalleryRouter(service))

4. Same pattern for:
   - Batch Processing
   - Vision Analysis
   - Prompt Grouping
   - File Management
   - etc.
```

## Summary

✨ **Clean Architecture Benefits:**

1. **Independent** - Services work without Express
2. **Testable** - No mocking framework needed
3. **Maintainable** - One concern per file
4. **Scalable** - Add features following same pattern
5. **Clear** - Request → Route → Service → Response
