# API Reference

All endpoints are available at `http://localhost:3001`

## Health Check

**GET** `/health`

Check if server is running.

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-27T12:00:00.000Z"
}
```

---

## Vision Analysis API

### Analyze Single Illustration

**POST** `/api/analyze-illustration`

Get AI quality score for a single image using Google Vision API with pattern learning from feedback.

Request:
```json
{
  "imagePath": "/path/to/image.png"
}
```

Response:
```json
{
  "overallScore": 8,
  "anatomyScore": 8,
  "poseScore": 7,
  "faceQuality": 8,
  "backgroundQuality": 7,
  "objectQuality": 9,
  "coherenceScore": 8,
  "detectedIssues": [
    "Background could be more detailed"
  ],
  "detectedStrengths": [
    "Excellent anatomical proportions",
    "Strong color palette"
  ],
  "recommendations": [
    "Consider adding more background elements",
    "Enhance lighting consistency"
  ],
  "confidence": 92,
  "feedback": {
    "applied": false,
    "corrections": 0
  },
  "processingTime": 1234
}
```

### Batch Analyze Illustrations

⚠️ **DEPRECATED: Use Batch Rating API instead** - This endpoint is implemented but not called by any UI component. The [Batch Rating API](#batch-rating-api) provides the same functionality with job tracking and async processing.

**POST** `/api/batch-analyze-illustrations`

Analyze multiple images in a batch operation. Currently unused.

Request:
```json
{
  "imagePaths": ["/path/to/image1.png", "/path/to/image2.png"]
}
```

Response:
```json
{
  "results": [
    {
      "imagePath": "/path/to/image1.png",
      "overallScore": 8,
      "confidence": 92,
      "processingTime": 1234
    },
    {
      "imagePath": "/path/to/image2.png",
      "overallScore": 7,
      "confidence": 88,
      "processingTime": 980
    }
  ],
  "stats": {
    "total": 2,
    "processed": 2,
    "averageScore": 7.5,
    "totalTime": 2214
  }
}
```

---

## Ratings API

Unified ratings storage for all grouping types (Artist Gallery, Prompt Grouping, Batch Rating).

### Load Ratings

**GET** `/api/ratings/load?folderPath=<folderPath>`

Load all image ratings from a folder.

Response:
```json
{
  "success": true,
  "ratings": {
    "image1.png": 8,
    "image2.png": 7,
    "image3.png": 9
  }
}
```

### Save Ratings

**POST** `/api/ratings/save`

Save ratings for images in a folder.

Request:
```json
{
  "folderPath": "/path/to/folder",
  "ratings": {
    "image1.png": 8,
    "image2.png": 7,
    "image3.png": 9
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Ratings saved successfully",
  "totalEntries": 3
}
```

---

## Artist Gallery API

Advanced image grouping by artist tags with ratings and visual organization.

### Load Artist Groups

**POST** `/api/artist-gallery/load-groups`

Load and organize images by detected artist tags.

Request:
```json
{
  "folderPath": "/path/to/folder"
}
```

Response:
```json
{
  "success": true,
  "sortedFolder": "Sorted_Artists",
  "baseFolder": "/path/to/folder",
  "groups": [
    {
      "folderName": "artist_name",
      "folderPath": "/path/to/folder/Sorted_Artists/artist_name",
      "artistKey": "artist_name",
      "artists": ["Artist Name"],
      "imageCount": 5,
      "thumbnailPath": "/path/to/image1.png",
      "images": ["image1.png", "image2.png"],
      "latestModifiedTime": 1703001600000,
      "averageRating": 8.2
    }
  ],
  "totalGroups": 3,
  "totalImages": 15
}
```

### Get Group Images

**POST** `/api/artist-gallery/group-images`

Get image list for a specific artist group.

Request:
```json
{
  "folderPath": "/path/to/group/folder"
}
```

Response:
```json
{
  "images": ["image1.png", "image2.png", "image3.png"]
}
```

### Get Image Metadata

**GET** `/api/artist-gallery/image-metadata?filePath=<filePath>`

Get metadata for a specific image (prompt, artists, generation data).

Response:
```json
{
  "filename": "image.png",
  "prompt": "a girl with magical powers",
  "artists": ["Artist Name"],
  "generationData": {
    "model": "model_name",
    "seed": 12345,
    "steps": 30
  }
}
```

### Get Image

**GET** `/api/artist-gallery/image?filePath=<filePath>&thumbnail=<true|false>`

Get image file (full or thumbnail).

Response: Binary image data (PNG/JPG/GIF)

### Copy From Source Folder

**POST** `/api/artist-gallery/copy-from-source`

Copy artist groups and images from a source folder to destination, merging artist mappings.

Request:
```json
{
  "sourcePath": "/source/folder",
  "destinationPath": "/destination/folder"
}
```

Response:
```json
{
  "success": true,
  "message": "Copy completed successfully",
  "copiedGroups": 5,
  "copiedImages": 25,
  "mergedMapping": true
}
```

---

## Prompt Grouping API

Group images by identical prompts with multi-level organization.

### Load Prompt Groups

**POST** `/api/prompt-grouping/load-groups`

Load and organize images by prompt similarity.

Request:
```json
{
  "folderPath": "/path/to/folder",
  "useCache": false
}
```

Response:
```json
{
  "success": true,
  "groups": [
    {
      "groupId": "group_001",
      "prompt": "a girl sitting in a park",
      "imageCount": 5,
      "images": ["image1.png", "image2.png"],
      "nickname": "Park Girl Variations",
      "averageRating": 8.2
    }
  ],
  "totalGroups": 10,
  "totalImages": 50,
  "processingTime": 5000
}
```

### Get Progress

**GET** `/api/prompt-grouping/progress?folderPath=<folderPath>`

Get progress of current grouping operation.

Response:
```json
{
  "folderPath": "/path/to/folder",
  "status": "processing",
  "processed": 25,
  "total": 50,
  "percentage": 50
}
```

### Set Nickname

**POST** `/api/prompt-grouping/set-nickname`

Set a custom nickname for a prompt group.

Request:
```json
{
  "folderPath": "/path/to/folder",
  "groupId": "group_001",
  "nickname": "Park Girl Variations"
}
```

Response:
```json
{
  "success": true,
  "groupId": "group_001",
  "nickname": "Park Girl Variations"
}
```

### Get Image

**GET** `/api/prompt-grouping/image?filePath=<filePath>&thumbnail=<true|false>`

Get image from a prompt group.

Response: Binary image data

### Get Image Metadata

**GET** `/api/prompt-grouping/image-metadata?filePath=<filePath>`

Get metadata for image in prompt group.

Response:
```json
{
  "filename": "image.png",
  "prompt": "a girl sitting in a park",
  "artists": ["Artist Name"],
  "generationData": {}
}
```

---

## Batch Rating API

Apply ratings and AI analysis to multiple images in a single asynchronous batch job. **This is the primary batch processing system** used by the frontend. Each image analysis includes learned patterns from user feedback (same as single-image analysis).

### Submit Batch Job

**POST** `/api/batch-rating/submit`

Start a batch rating job for multiple images.

Request:
```json
{
  "folderPath": "/path/to/folder",
  "imagePaths": ["/path/to/image1.png", "/path/to/image2.png"],
  "rating": 8
}
```

Response:
```json
{
  "success": true,
  "jobId": "job_12345",
  "status": "queued",
  "totalImages": 2
}
```

### Check Job Status

**GET** `/api/batch-rating/status/:jobId`

Get current status of a batch job.

Response:
```json
{
  "jobId": "job_12345",
  "status": "completed",
  "progress": 2,
  "total": 2,
  "results": [
    { "imagePath": "/path/to/image1.png", "success": true, "rating": 8 },
    { "imagePath": "/path/to/image2.png", "success": true, "rating": 8 }
  ]
}
```

### Get All Jobs

**GET** `/api/batch-rating/jobs`

Get list of all batch jobs.

Response:
```json
{
  "jobs": [
    {
      "jobId": "job_12345",
      "status": "completed",
      "totalImages": 2,
      "processedImages": 2,
      "createdAt": "2026-03-27T12:00:00.000Z"
    }
  ],
  "total": 5
}
```

### Get Job Results

**GET** `/api/batch-rating/results/:jobId`

Get detailed results for a completed batch job.

Response:
```json
{
  "jobId": "job_12345",
  "status": "completed",
  "results": [
    {
      "imagePath": "/path/to/image1.png",
      "success": true,
      "rating": 8,
      "message": "Rated successfully"
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

### Cancel Batch Job

**POST** `/api/batch-rating/cancel/:jobId`

Cancel an in-progress batch job.

Response:
```json
{
  "success": true,
  "jobId": "job_12345",
  "message": "Batch job cancelled"
}
```

---

## Feedback API

Collect user feedback on AI analysis to improve scoring accuracy over time.

### Submit Feedback

**POST** `/api/feedback/submit`

Submit feedback on AI analysis for a single image. System learns from corrections to refine component weights.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "imageId": "image.png",
  "aiScore": 7,
  "userScore": 8,
  "reasoning": "Face quality is actually excellent",
  "components": {
    "anatomyScore": 8,
    "poseScore": 7,
    "faceQuality": 9
  },
  "adjustedComponents": {
    "faceQuality": 9
  },
  "adjustmentDetails": {
    "faceQuality": "Adjusted up - facial features are well-proportioned"
  }
}
```

Response:
```json
{
  "success": true,
  "entry": {
    "imageId": "image.png",
    "correction": 1,
    "timestamp": "2026-03-27T12:00:00.000Z"
  },
  "feedbackCount": 45,
  "message": "Feedback recorded. AI will learn from your corrections!"
}
```

### Get Feedback Analysis

**GET** `/api/feedback/analysis?sourcePath=<sourcePath>`

Analyze feedback patterns to suggest weight adjustments for components.

Response:
```json
{
  "sourcePath": "/path/to/folder",
  "totalFeedback": 50,
  "patterns": {
    "underestimatedComponents": ["faceQuality", "backgroundQuality"],
    "overestimatedComponents": ["anatomyScore"],
    "suggestions": [
      "Increase weight for faceQuality (underestimated 12 times)",
      "Decrease weight for anatomyScore (overestimated 8 times)"
    ]
  },
  "correctionTrend": 0.95,
  "confidence": 0.87
}
```

### Get Component Adjustments

**GET** `/api/feedback/component-adjustments?sourcePath=<sourcePath>`

Analyze component-level adjustment patterns from user feedback.

Response:
```json
{
  "sourcePath": "/path/to/folder",
  "componentAdjustments": {
    "faceQuality": {
      "adjustedCount": 15,
      "averageAdjustment": 1.2,
      "direction": "increased",
      "trend": "consistent"
    },
    "backgroundQuality": {
      "adjustedCount": 8,
      "averageAdjustment": 0.9,
      "direction": "increased",
      "trend": "increasing"
    }
  },
  "mostCommonAdjustments": ["faceQuality", "backgroundQuality", "coherenceScore"]
}
```

### Get Feedback Statistics

**GET** `/api/feedback/stats?sourcePath=<sourcePath>`

Get overall feedback statistics.

Response:
```json
{
  "sourcePath": "/path/to/folder",
  "totalFeedback": 50,
  "averageCorrection": 0.95,
  "feedbackByComponent": {
    "anatomyScore": 12,
    "faceQuality": 18,
    "backgroundQuality": 15
  },
  "mostCorrectedComponent": "faceQuality",
  "learningConfidence": 0.88
}
```

### Get Feedback List

**GET** `/api/feedback/list?sourcePath=<sourcePath>`

Get all feedback entries for a folder (for review/debugging).

Response:
```json
{
  "sourcePath": "/path/to/folder",
  "entries": [
    {
      "imageId": "image1.png",
      "aiScore": 7,
      "userScore": 8,
      "reasoning": "Face quality is excellent",
      "correction": 1,
      "timestamp": "2026-03-27T12:00:00.000Z"
    }
  ],
  "total": 50
}
```

### Clear Feedback

**DELETE** `/api/feedback/clear?sourcePath=<sourcePath>`

Clear all feedback for a folder (cannot be undone).

Response:
```json
{
  "success": true,
  "message": "All feedback cleared",
  "clearedCount": 50
}
```

---

## Reviews Folder API

Manage detailed reviews stored in source folders (.reviews.json).

### List Reviews

**GET** `/api/reviews-folder/list?sourcePath=<sourcePath>`

Load all reviews from a folder.

Response:
```json
{
  "success": true,
  "sourcePath": "/path/to/folder",
  "reviews": [
    {
      "id": "review_001",
      "source": "source_name",
      "foreign_id": "ext_id_123",
      "rating": {
        "anatomy": 8,
        "face": 8,
        "object": 7,
        "background": 7,
        "character": 8
      },
      "notes": "Good overall composition",
      "timestamp": "2026-03-27T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Create Review

**POST** `/api/reviews-folder/create`

Create a new review.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "source": "source_name",
  "foreign_id": "ext_id_123",
  "rating": {
    "anatomy": 8,
    "face": 8,
    "object": 7,
    "background": 7,
    "character": 8
  },
  "notes": "Good composition but background needs work"
}
```

Response:
```json
{
  "success": true,
  "review": {
    "id": "review_001",
    "source": "source_name",
    "foreign_id": "ext_id_123",
    "rating": { /* ... */ },
    "notes": "...",
    "timestamp": "2026-03-27T12:00:00.000Z"
  }
}
```

### Update Review

**PUT** `/api/reviews-folder/update/:reviewId`

Update an existing review.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "rating": { /* updated rating object */ },
  "notes": "Updated notes"
}
```

Response:
```json
{
  "success": true,
  "review": { /* updated review */ }
}
```

### Delete Review

**DELETE** `/api/reviews-folder/delete/:reviewId`

Delete a review.

Request:
```json
{
  "sourcePath": "/path/to/folder"
}
```

Response:
```json
{
  "success": true,
  "message": "Review deleted"
}
```

### Get Review by Source

**GET** `/api/reviews-folder/get-by-source?sourcePath=<sourcePath>&source=<source>&foreign_id=<id>`

Get a specific review by source and ID.

Response:
```json
{
  "success": true,
  "review": { /* review object */ }
}
```

### Check Review Exists

**POST** `/api/reviews-folder/check-exists`

Check if a review exists for given source/ID.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "source": "source_name",
  "foreign_id": "ext_id_123"
}
```

Response:
```json
{
  "exists": true,
  "review": { /* review object if exists, null otherwise */ }
}
```

---

## Tags API

Manage tags for reviews and other entities in source folders (.tags.json). Tags are generic and can be applied to reviews, galleries, or any future features.

### List Tags

**GET** `/api/tags/list?sourcePath=<sourcePath>`

Get all available tags in a source folder.

Response:
```json
{
  "success": true,
  "sourcePath": "/path/to/folder",
  "tags": [
    {
      "id": "tag_uuid_001",
      "name": "High Priority",
      "color": "#FF5733",
      "createdAt": "2026-03-27T12:00:00.000Z"
    },
    {
      "id": "tag_uuid_002",
      "name": "Review Later",
      "color": "#33B5E5",
      "createdAt": "2026-03-27T12:00:00.000Z"
    }
  ],
  "count": 2
}
```

### Create Tag

**POST** `/api/tags/create`

Create a new tag in a source folder.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "name": "High Priority",
  "color": "#FF5733"
}
```

Response:
```json
{
  "success": true,
  "tag": {
    "id": "tag_uuid_001",
    "name": "High Priority",
    "color": "#FF5733",
    "createdAt": "2026-03-27T12:00:00.000Z"
  }
}
```

### Update Tag

**PUT** `/api/tags/update/:tagId`

Update an existing tag.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "name": "Critical Priority",
  "color": "#FF0000"
}
```

Response:
```json
{
  "success": true,
  "tag": {
    "id": "tag_uuid_001",
    "name": "Critical Priority",
    "color": "#FF0000",
    "updatedAt": "2026-03-27T12:00:00.000Z"
  }
}
```

### Delete Tag

**DELETE** `/api/tags/delete/:tagId?sourcePath=<sourcePath>`

Delete a tag from a source folder.

Response:
```json
{
  "success": true,
  "tag": {
    "id": "tag_uuid_001",
    "name": "High Priority",
    "color": "#FF5733"
  }
}
```

### Add Tag to Review

**POST** `/api/tags/reviews/:reviewId/add/:tagId?sourcePath=<sourcePath>`

Add a tag to a specific review.

Response:
```json
{
  "success": true,
  "review": {
    "id": "review_001",
    "tags": ["tag_uuid_001", "tag_uuid_002"],
    ...
  }
}
```

### Remove Tag from Review

**DELETE** `/api/tags/reviews/:reviewId/remove/:tagId?sourcePath=<sourcePath>`

Remove a tag from a specific review.

Response:
```json
{
  "success": true,
  "review": {
    "id": "review_001",
    "tags": ["tag_uuid_001"],
    ...
  }
}
```

### Filter Reviews by Tags

**GET** `/api/tags/reviews/filter?sourcePath=<sourcePath>&tags=<tagId1>,<tagId2>`

Get reviews that have all specified tags (AND logic).

Query Parameters:
- `sourcePath` (required): Path to source folder
- `tags` (optional): Comma-separated tag IDs to filter by

Response:
```json
{
  "success": true,
  "sourcePath": "/path/to/folder",
  "tags": ["tag_uuid_001", "tag_uuid_002"],
  "reviews": [
    {
      "id": "review_001",
      "source": "artist_gallery",
      "foreign_id": "folder_name",
      "rating": { ... },
      "tags": ["tag_uuid_001", "tag_uuid_002"],
      "notes": "..."
    }
  ],
  "count": 1
}
```

### Add Tag to Image

**POST** `/api/tags/images/add-tag`

Add a tag to a specific image (by filename). Supports cross-feature use (reviews, artist-gallery, prompt-grouping).

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "imageFilename": "image.png",
  "tagId": "tag_uuid_001"
}
```

Response:
```json
{
  "success": true,
  "imageFilename": "image.png",
  "tags": ["tag_uuid_001"]
}
```

### Remove Tag from Image

**DELETE** `/api/tags/images/remove-tag`

Remove a tag from a specific image.

Request:
```json
{
  "sourcePath": "/path/to/folder",
  "imageFilename": "image.png",
  "tagId": "tag_uuid_001"
}
```

Response:
```json
{
  "success": true,
  "imageFilename": "image.png",
  "tags": []
}
```

### Get Image Tags

**GET** `/api/tags/images/get-tags?sourcePath=<sourcePath>&imageFilename=<filename>`

Get all tags assigned to a specific image.

Query Parameters:
- `sourcePath` (required): Path to source folder
- `imageFilename` (required): Name of the image file

Response:
```json
{
  "success": true,
  "imageFilename": "image.png",
  "tagIds": ["tag_uuid_001", "tag_uuid_002"],
  "tags": [
    {
      "id": "tag_uuid_001",
      "name": "High Quality",
      "color": "#FF5733",
      "createdAt": "2026-03-27T12:00:00.000Z"
    },
    {
      "id": "tag_uuid_002",
      "name": "To Review",
      "color": "#33B5E5",
      "createdAt": "2026-03-27T12:00:00.000Z"
    }
  ]
}
```

### Filter Images by Tags

**GET** `/api/tags/images/filter?sourcePath=<sourcePath>&imageFilenames=<file1>,<file2>&tags=<tagId1>,<tagId2>`

Get images that have all specified tags (AND logic).

Query Parameters:
- `sourcePath` (required): Path to source folder
- `imageFilenames` (optional): Comma-separated list of image filenames to filter
- `tags` (optional): Comma-separated tag IDs to filter by

Response:
```json
{
  "success": true,
  "sourcePath": "/path/to/folder",
  "tags": ["tag_uuid_001"],
  "imageFilenames": ["image1.png", "image2.png"],
  "count": 2
}
```

---

## Folder Operations API

### Pick Folder

**POST** `/api/pick-folder`

Open system folder picker dialog (Electron only).

Response:
```json
{
  "success": true,
  "folderPath": "/path/to/selected/folder"
}
```

### Open Folder

**POST** `/api/open-folder`

Open a folder in system file explorer.

Request:
```json
{
  "path": "/path/to/folder"
}
```

Response:
```json
{
  "success": true
}
```

### Open File

**POST** `/api/open-file`

Open a file with default system application.

Request:
```json
{
  "path": "/path/to/file"
}
```

Response:
```json
{
  "success": true
}
```

---

## Image Serving API

### List Images in Folder

**GET** `/api/images/:folder`

List all images in a folder.

Response:
```json
[
  { "filename": "image1.png", "size": 1024000, "modified": 1703001600000 },
  { "filename": "image2.png", "size": 2048000, "modified": 1703001650000 }
]
```

### Get Image File

**GET** `/api/images/:folder/:file`

Get image file content.

Response: Binary image data (PNG/JPG/GIF)

---

## Image Metadata API

### Get Image Metadata

**GET** `/api/image-metadata/:folder/:filename`

Get metadata for a specific image file.

Response:
```json
{
  "filename": "image.png",
  "prompt": "a girl with magical powers",
  "artists": ["Artist Name"],
  "generationData": {
    "model": "model_name",
    "seed": 12345,
    "steps": 30
  }
}
```

---

## Legacy API Endpoints

These endpoints are maintained for backward compatibility and are **actively used by the frontend** (ReviewService) for artist grouping workflows.

**Note:** The newer [Artist Gallery API](#artist-gallery-api) provides similar functionality with additional features (ratings, thumbnails, metadata). The legacy endpoints remain for simpler, direct grouping use cases.

### Group By Artists

**POST** `/api/group-by-artists/:folder`

Group images by artist tags in a specific folder (from generated directory). **Used by:** ReviewService

Request:
```json
{}
```

Response:
```json
{
  "success": true,
  "groupCount": 3,
  "totalImages": 15,
  "groups": {
    "artist_name": {
      "artists": ["Artist Name"],
      "imageCount": 5,
      "images": ["image1.png", "image2.png"]
    }
  }
}
```

### Group By Artists (Path)

**POST** `/api/group-by-artists-path`

Group images from source folder to destination folder by artist tags with incremental syncing. **Used by:** ReviewService for flexible folder mapping.

**Critical note:** This endpoint has a side effect that sets the current source path for feedback storage, which the frontend depends on.

Request:
```json
{
  "sourcePath": "/path/to/source/folder",
  "destinationPath": "/path/to/destination/folder",
  "usePreSorted": false
}
```

Response:
```json
{
  "success": true,
  "groups": {
    "artist_name": {
      "count": 5,
      "images": ["image1.png", "image2.png"]
    }
  },
  "totalSourceImages": 15,
  "imagesToProcess": 5,
  "copiedImages": 5,
  "existingImages": 10
}
```



All errors return consistent format:

```json
{
  "error": "Error message",
  "details": "Additional context"
}
```

HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad request
- `404` - Not found
- `500` - Server error

---

## Testing

### Using curl

```bash
# Health check
curl http://localhost:3001/health

# Save rating
curl -X POST http://localhost:3001/api/reviews/save \
  -H "Content-Type: application/json" \
  -d '{"imagePath":"/path/to/image.png","rating":8}'

# Get rating
curl "http://localhost:3001/api/reviews/get?path=/path/to/image.png"

# Analyze image
curl -X POST http://localhost:3001/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{"imagePath":"/path/to/image.png"}'
```

### Using JavaScript/Fetch

```javascript
// Save rating
const response = await fetch('http://localhost:3001/api/reviews/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imagePath: '/path/to/image.png',
    rating: 8
  })
});

const data = await response.json();
console.log(data);
```

---

**Last Updated**: March 27, 2026
