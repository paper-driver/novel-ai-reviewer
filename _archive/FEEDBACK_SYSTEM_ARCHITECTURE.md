# Feedback System - Complete Technical Reference

## System Overview

The feedback system allows you to correct AI ratings and have those corrections applied to future analyses.

```
┌─────────────────┐
│   User Views    │
│    Image        │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Click "AI Rate"                    │
│  Backend: /api/analyze-illustration │
│  ├─ Get Vision API analysis         │
│  ├─ Load feedback for image         │
│  ├─ Apply user scores (if found)    │
│  └─ Return analysis                 │
└────────┬────────────────────────────┘
         │
         ▼
   ┌──────────────────┐
   │  UI Shows Score  │
   │  (AI or User)    │
   └────────┬─────────┘
            │
            ├─ User agrees? Done! ✓
            │
            └─ User disagrees?
                 │
                 ▼
         ┌────────────────┐
         │ Click "Correct │
         │     the AI"    │
         └────────┬───────┘
                  │
                  ▼
         ┌──────────────────────┐
         │ Submit Feedback      │
         │ ├─ Your rating       │
         │ ├─ Reasoning         │
         │ ├─ Component scores  │
         │ └─ Image filename    │
         └────────┬─────────────┘
                  │
                  ▼
    ┌────────────────────────────┐
    │  Backend: /api/feedback/   │
    │          submit             │
    │  ├─ Receive feedback        │
    │  ├─ Store in .ai-feedback  │
    │  │   .json                  │
    │  └─ Return success          │
    └──────────────────────────────┘
```

---

## API Endpoints

### Submit Feedback
```
POST /api/feedback/submit

Request Body:
{
  "imageId": "filename.png",
  "aiScore": 6,
  "userScore": 8,
  "reasoning": "User's explanation",
  "components": {
    "anatomy": 7,
    "pose": 6,
    "face": 8,
    "background": 5,
    "objects": 7,
    "coherence": 8
  },
  "sourcePath": "/path/to/source/folder"
}

Response:
{
  "success": true,
  "entry": { ...stored entry... },
  "feedbackCount": 38,
  "message": "Feedback recorded. AI will learn from your corrections!"
}
```

### Analyze Illustration (with Feedback)
```
POST /api/analyze-illustration

Request Body:
{
  "filePath": "/full/path/to/image.png",
  "sourcePath": "/path/to/source/folder" (optional)
}

Response:
{
  "overallScore": 6,
  "anatomyScore": 7,
  "poseScore": 6,
  "faceQuality": 8,
  "backgroundQuality": 5,
  "objectQuality": 7,
  "coherenceScore": 8,
  "feedbackApplied": true,
  "feedbackDetails": {
    "priorUserScore": 8,
    "priorAIScore": 6,
    "correction": 2,
    "reasoning": "User's explanation",
    "timestamp": "2026-03-13T12:30:45.123Z"
  }
}
```

### Get Feedback Analysis
```
GET /api/feedback/analysis?sourcePath=/path/to/source

Response:
{
  "status": "success",
  "feedbackCount": 37,
  "analysis": {
    "overallBias": {
      "description": "AI scores too low",
      "amount": 1.2,
      "recommendation": "..."
    },
    "componentPatterns": {
      "anatomy": {...},
      "pose": {...},
      ...
    },
    "recentCorrections": [...]
  }
}
```

### List All Feedback
```
GET /api/feedback/list?sourcePath=/path/to/source

Response:
{
  "entries": [
    {
      "imageId": "filename.png",
      "userScore": 8,
      "aiScore": 6,
      "components": {...},
      ...
    },
    ...
  ]
}
```

### Clear All Feedback
```
DELETE /api/feedback/clear?sourcePath=/path/to/source

Response:
{
  "success": true,
  "message": "All feedback cleared"
}
```

---

## File Locations

### Feedback Storage
```
{sourcePath}/.ai-feedback.json

Example:
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Backup (from cleanup)
```
{sourcePath}/.ai-feedback.json.backup.{timestamp}

Example:
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json.backup.1773440406754
```

### Cleanup Utility
```
/Users/leonmao/Documents/Projects/novel-ai-reviewer/cleanup-feedback.js

Usage:
node cleanup-feedback.js "/path/to/source/folder"
```

---

## Code Architecture

### Backend (server.js)

#### Global Variable
```javascript
let currentSourcePath = null;
```
Tracks the currently selected source folder for feedback operations.

#### Core Functions

**loadFeedback(sourcePath)**
```javascript
function loadFeedback(sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  if (!folderPath) return { entries: [] };
  
  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // Read and parse feedback file
  // Return entries array or empty array if not found
}
```

**saveFeedback(feedbackData, sourcePath)**
```javascript
function saveFeedback(feedbackData, sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  if (!folderPath) return;
  
  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // Write feedback data to file
}
```

#### Endpoints

**POST /api/feedback/submit**
- Receives feedback from frontend
- Extracts sourcePath from request body
- Loads existing feedback from sourcePath
- Adds new entry
- Saves updated feedback

**POST /api/analyze-illustration**
- Performs Vision API analysis
- Detects sourcePath from file path OR uses req.body.sourcePath
- Loads feedback from sourcePath
- If image found in feedback, applies component scores
- Returns analysis with feedbackApplied flag

**GET /api/feedback/analysis**
- Accepts sourcePath as query parameter
- Loads feedback from sourcePath
- Analyzes patterns and biases
- Returns analysis report

**GET /api/feedback/list**
- Accepts sourcePath as query parameter
- Loads feedback from sourcePath
- Returns all entries

**DELETE /api/feedback/clear**
- Accepts sourcePath as query parameter
- Clears feedback from sourcePath
- Saves empty entries array

### Frontend (Angular)

#### Service: AiFeedbackService
```typescript
submitFeedback(
  feedback: {
    imageId: string;
    aiScore: number;
    userScore: number;
    reasoning: string;
    components: any;
    sourcePath?: string;
  },
  sourcePath?: string
): Observable<any>
```
Sends feedback to backend with sourcePath parameter.

#### Component: ImageViewerModalComponent
```typescript
// When submitting feedback:
const feedbackData = {
  imageId: this.currentImageName,
  aiScore: this.illustrationAnalysis?.overallScore,
  userScore: feedback.userScore,
  components: {...},
  sourcePath: this.reviewData?.folder
};

this.aiFeedbackService.submitFeedback(
  feedbackData, 
  this.reviewData?.folder
).subscribe(...)
```
Includes sourcePath from reviewData.

---

## Data Flow

### 1. User Submits Feedback
```
Frontend (UI)
  ↓
imageId: "filename.png"
sourcePath: "/Volumes/.../SortByArtist"
  ↓
HTTP POST /api/feedback/submit
  ↓
Backend receives request
  ↓
Extract sourcePath from req.body
  ↓
loadFeedback(sourcePath)
  ↓
Reads .ai-feedback.json from sourcePath
  ↓
Add new entry
  ↓
saveFeedback(feedbackData, sourcePath)
  ↓
Writes to .ai-feedback.json
  ↓
Response to frontend: success
```

### 2. User Analyzes Image
```
Frontend requests analysis
  ↓
Image path: "/Volumes/.../SortByArtist/artist/image.png"
sourcePath: "/Volumes/.../SortByArtist"
  ↓
Backend:
  - Get Vision API analysis
  - Extract imageId = "image.png"
  - loadFeedback(sourcePath)
  - Search for imageId in feedback entries
  ↓
If found:
  - Extract component scores from feedback
  - Replace AI component scores with user scores
  - Recalculate overall score
  - Set feedbackApplied = true
  ↓
Return analysis
```

---

## Feedback Application Logic

### Component Score Override
```javascript
if (priorFeedback) {
  const feedbackComponents = priorFeedback.components;
  
  if (feedbackComponents.anatomy !== undefined) {
    anatomyScore = feedbackComponents.anatomy;
  }
  if (feedbackComponents.pose !== undefined) {
    poseScore = feedbackComponents.pose;
  }
  // ... repeat for all components
}
```

### Overall Score Recalculation
```javascript
const overallScore = Math.round(
  (anatomyScore * 0.20 + 
   poseScore * 0.15 + 
   faceQuality * 0.20 + 
   backgroundQuality * 0.15 + 
   objectQuality * 0.15 + 
   coherenceScore * 0.15)
);
```

Weights:
- Anatomy: 20%
- Pose: 15%
- Face: 20%
- Background: 15%
- Objects: 15%
- Coherence: 15%

---

## Error Handling

### Missing sourcePath
```javascript
if (!sourcePath && !currentSourcePath) {
  return res.status(400).json({
    error: 'Source path not set. Please select a folder first.'
  });
}
```

### Missing Feedback File
```javascript
if (!fs.existsSync(feedbackFile)) {
  return { entries: [] };  // Return empty array
}
```

### Invalid JSON
```javascript
try {
  return JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
} catch (err) {
  console.error('[Feedback] Failed to parse:', err);
  return { entries: [] };
}
```

---

## Performance Considerations

### Feedback Lookup
- Linear search through entries: O(n) where n = feedback entries
- For 37 entries: negligible impact
- Scales well up to thousands of entries

### File I/O
- Read: Single file read per analysis/submission
- Write: Single file write per submission
- Cached in memory during request

### Vision API Caching
- Feedback doesn't cache Vision API results
- Always re-analyzes, just applies different scores
- More accurate for detecting changes

---

## Future Improvements

### 1. Feedback Matching
- Fuzzy matching for similar filenames
- Handle slight file renames
- Detect duplicate images with different seeds

### 2. Advanced Analysis
- Machine learning on feedback patterns
- Predict user preferences
- Suggest corrections automatically

### 3. Export/Import
- Export feedback to CSV
- Import feedback from other sources
- Merge feedback from multiple folders

### 4. Versioning
- Track feedback history
- See how corrections change over time
- Rollback incorrect feedback

### 5. Sharing
- Share feedback with others
- Collaborative rating
- Community feedback aggregation

---

## Debugging

### Check Feedback File
```bash
cat /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json | python3 -m json.tool
```

### Check Server Logs
```bash
tail -50 /tmp/server.log | grep "\[Feedback\]\|\[Illustration\]"
```

### Test API Directly
```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "test.png",
    "aiScore": 6,
    "userScore": 8,
    "components": {},
    "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
  }' | python3 -m json.tool
```

### Verify Feedback Application
```bash
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.../image.png",
    "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
  }' | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Feedback Applied: {data[\"feedbackApplied\"]}')"
```

---

## Summary

The feedback system is now fully functional with:
✅ Proper sourcePath parameter handling
✅ Clean, valid feedback file (37 entries)
✅ Verified feedback application
✅ Complete error handling
✅ Detailed logging
✅ Comprehensive cleanup utility

Your AI is ready to learn from your corrections!
