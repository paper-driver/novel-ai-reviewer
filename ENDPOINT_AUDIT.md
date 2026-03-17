# Comprehensive Endpoint Audit - server.js vs server.modular.js

## All Endpoints from server.js (40 total)

### Reviews Management (5)
1. ✅ POST /api/reviews
2. ✅ GET /api/reviews
3. ❓ GET /api/reviews/:id/images
4. ✅ PUT /api/reviews/:id
5. ✅ DELETE /api/reviews/:id

### Image Management (2)
1. ❓ GET /api/images/:folder/:file
2. ❓ GET /api/image-metadata/:folder/:filename

### Legacy Artist Grouping (2)
1. ✅ POST /api/group-by-artists/:folder
2. ✅ POST /api/group-by-artists-path

### Artist Gallery (5)
1. ❓ POST /api/artist-gallery/load-groups
2. ❓ POST /api/artist-gallery/group-images
3. ❓ GET /api/artist-gallery/image-metadata
4. ❓ GET /api/artist-gallery/image
5. ❓ POST /api/artist-gallery/copy-from-source

### Folder Operations (3)
1. ❓ POST /api/pick-folder
2. ❓ POST /api/open-folder
3. ❓ POST /api/open-file

### Prompt Grouping (6)
1. ✅ POST /api/prompt-grouping/load-groups
2. ✅ GET /api/prompt-grouping/progress
3. ✅ POST /api/prompt-grouping/set-nickname
4. ✅ GET /api/prompt-grouping/image
5. ✅ GET /api/prompt-grouping/image-metadata
6. ❓ POST /api/prompt-grouping/save-ratings
7. ❓ GET /api/prompt-grouping/load-ratings

### Artist Gallery Ratings (2)
1. ❓ POST /api/artist-gallery/save-ratings
2. ❓ GET /api/artist-gallery/load-ratings

### Ratings (2)
1. ❓ POST /api/ratings/save
2. ❓ GET /api/ratings/load

### Batch Rating (5)
1. ✅ POST /api/batch-rating/submit
2. ✅ GET /api/batch-rating/status/:jobId
3. ❓ GET /api/batch-rating/jobs
4. ❓ GET /api/batch-rating/results/:jobId
5. ❓ POST /api/batch-rating/cancel/:jobId

### Vision Analysis (2)
1. ✅ POST /api/analyze-illustration
2. ✅ POST /api/batch-analyze-illustrations

### Feedback (5)
1. ✅ POST /api/feedback/submit
2. ✅ GET /api/feedback/analysis
3. ✅ GET /api/feedback/stats
4. ✅ GET /api/feedback/list
5. ✅ DELETE /api/feedback/clear

## Issues to Investigate

### Missing or Questionable Endpoints
- GET /api/images/:folder/:file - Should this be different from /api/prompt-grouping/image?
- GET /api/image-metadata/:folder/:filename - Should check if this is implemented
- POST /api/artist-gallery/* - Multiple endpoints that may or may not be in routes
- POST/GET /api/pick-folder, /api/open-folder, /api/open-file - File system operations
- POST/GET /api/ratings/* - Rating save/load endpoints
- GET /api/batch-rating/jobs, results, cancel - Additional batch job endpoints

## Next Steps
1. Check each route file to verify endpoint implementation
2. Identify which endpoints are missing
3. Fix or implement missing endpoints
