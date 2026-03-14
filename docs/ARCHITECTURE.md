# 🔧 Technical Reference - Feedback System Architecture

## System Architecture

### Overview
```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Angular)                      │
│                   image-viewer-modal.component              │
│                  (Feedback submission UI)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Node.js Express)                   │
│                      server.js                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │   /api/feedback/submit   - Store feedback          │    │
│   │   /api/analyze-illustration - Apply & analyze      │    │
│   │   /api/feedback/list - Retrieve entries            │    │
│   │   /api/feedback/analysis - Statistics              │    │
│   │   /api/feedback/clear - Remove all                 │    │
│   └────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │ File I/O
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Feedback Storage                           │
│        .ai-feedback.json (per-source folder)                │
│   /Volumes/WD_BLACK/.../SortByArtist/.ai-feedback.json      │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

### Server-Side

**Location**: `/Users/leonmao/Documents/Projects/novel-ai-reviewer/server.js`

**Key Functions**:
```javascript
// Load feedback from source folder
function loadFeedback(sourcePath) {
  const feedbackFile = path.join(sourcePath, '.ai-feedback.json');
  return JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
}

// Save feedback to source folder
function saveFeedback(feedbackData, sourcePath) {
  const feedbackFile = path.join(sourcePath, '.ai-feedback.json');
  fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2));
}
```

**Key Endpoints**:

1. **POST /api/feedback/submit** (Line 3000-3050)
   - Receives: `imageId`, `aiScore`, `userScore`, `correction`, `reasoning`, `components`, `sourcePath`
   - Stores entry in `.ai-feedback.json`
   - Returns: `{ success: true, entryCount: 47 }`

2. **POST /api/analyze-illustration** (Line 3093-3340)
   - Receives: `filePath`, `sourcePath`
   - Generates AI analysis via Vision API
   - Looks up feedback for `imageId`
   - Applies component corrections if found
   - Returns: Complete analysis with `feedbackApplied` flag

3. **GET /api/feedback/list** (Line 3400-3420)
   - Query param: `sourcePath`
   - Returns: All feedback entries as JSON array

4. **GET /api/feedback/analysis** (Line 3430-3480)
   - Query param: `sourcePath`
   - Analyzes patterns in feedback
   - Returns: Statistics about user's rating behavior

5. **DELETE /api/feedback/clear** (Line 3490-3510)
   - Query param: `sourcePath`
   - Removes all feedback entries
   - Returns: `{ success: true, clearedCount: 47 }`

### Frontend-Side

**Location**: `/Users/leonmao/Documents/Projects/novel-ai-reviewer/src/app/services/ai-feedback.service.ts`

**Key Methods**:
```typescript
submitFeedback(feedback: any, sourcePath?: string): Observable<any> {
  return this.http.post('/api/feedback/submit', 
    { ...feedback, sourcePath });
}

listFeedback(sourcePath?: string): Observable<any> {
  return this.http.get('/api/feedback/list',
    { params: sourcePath ? { sourcePath } : {} });
}

getAnalysis(sourcePath?: string): Observable<any> {
  return this.http.get('/api/feedback/analysis',
    { params: sourcePath ? { sourcePath } : {} });
}

clearFeedback(sourcePath?: string): Observable<any> {
  return this.http.delete('/api/feedback/clear',
    { params: sourcePath ? { sourcePath } : {} });
}
```

**UI Component**: `/Users/leonmao/Documents/Projects/novel-ai-reviewer/src/app/components/image-viewer-modal/image-viewer-modal.component.ts`

Key lines:
- Line 774: Passes `sourcePath: this.reviewData?.folder` when submitting

---

## Feedback File Format

### Location
```
{sourcePath}/.ai-feedback.json
Example: /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Structure
```json
{
  "entries": [
    {
      "imageId": "1girl, {{{{kitagawa marin, pink eyes, blonde hair, medium breasts, medium hips, s-1011156380.png",
      "aiScore": 6,
      "userScore": 8,
      "correction": 2,
      "reasoning": "good skin texture and accurate clothing drawing",
      "components": {
        "anatomy": 5,
        "pose": 6,
        "face": 6,
        "background": 6,
        "objects": 4,
        "coherence": 7
      },
      "timestamp": "2026-03-13T20:56:26.897Z"
    }
  ]
}
```

### Field Descriptions
| Field | Type | Description |
|-------|------|-------------|
| `imageId` | string | Full filename from analysis (includes prompt) |
| `aiScore` | number | AI's overall score (1-10) |
| `userScore` | number | Your rating (1-10) |
| `correction` | number | userScore - aiScore |
| `reasoning` | string | Why you adjusted the score |
| `components` | object | Your individual component scores |
| `timestamp` | string | ISO 8601 when feedback was submitted |

---

## Data Flow

### Submission Flow
```
1. User opens image modal
2. AI analysis completes (Vision API)
3. User clicks "Give Feedback"
4. Adjusts slider and enters reasoning
5. Clicks "Submit Feedback"
6. Frontend sends POST to /api/feedback/submit
   {
     imageId: "s-1011156380.png",
     aiScore: 6,
     userScore: 8,
     correction: 2,
     reasoning: "good skin texture",
     components: {...},
     sourcePath: "/Volumes/WD_BLACK/.../SortByArtist"
   }
7. Backend receives request
8. Loads existing .ai-feedback.json
9. Adds new entry
10. Saves updated file
11. Returns success response
12. UI shows "✓ Feedback recorded (47 total)"
```

### Analysis Flow
```
1. User requests analysis of image
2. Server checks if file exists
3. Reads image and generates Vision API analysis
4. Gets initial scores from AI
5. Extract sourcePath from file path or request
6. Load .ai-feedback.json from sourcePath
7. Search for matching imageId in feedback entries
8. If match found:
   - Apply component score corrections
   - Recalculate overall score
   - Log [FEEDBACK APPLIED]
9. Return analysis with feedbackApplied flag
```

---

## Component Scoring System

### Weights
```
Anatomy (20%):     Proportions, anatomy accuracy
Pose (15%):        Posture, positioning, naturalness
Face (20%):        Facial features, expression quality
Background (15%):  Environment, detail, composition
Objects (15%):     Props, clothing, item accuracy
Coherence (15%):   Overall harmony, style consistency
```

### Calculation
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

### AI Scoring Process
1. Vision API analyzes image
2. Extracts labels, objects, colors, text
3. Evaluates anatomy, pose, face, background, objects, coherence
4. Applies penalties for detected issues
5. Applies bonuses for detected strengths
6. Clamps all scores to 1-10
7. Calculates weighted overall score
8. **Then**: Applies user feedback corrections (if available)

---

## Recent Changes (ai-poc-2 branch)

### Fixed Issues
1. **sourcePath Parameter** - Now properly passed through all layers
2. **Feedback Detection** - Correctly matches imageId in feedback file
3. **Component Corrections** - Applied before overall score recalculation
4. **Per-Source Storage** - Each source folder has own .ai-feedback.json

### Code Changes
```javascript
// In /api/analyze-illustration endpoint (Line 3250-3340)

// 1. Extract imageId from file path
const imageId = path.basename(filePath);

// 2. Detect source path from file or request
const sourcePath = req.body.sourcePath || detectedSourcePath || currentSourcePath;

// 3. Load feedback
const feedbackData = loadFeedback(sourcePath);

// 4. Find matching entry
const priorFeedback = feedbackData.entries.find(e => e.imageId === imageId);

// 5. Apply corrections if found
if (priorFeedback) {
  if (feedbackComponents.anatomy !== undefined) {
    anatomyScore = feedbackComponents.anatomy;
  }
  // ... repeat for all components ...
  
  // Recalculate overall score
  overallScore = feedbackOverallScore;
}
```

---

## Testing

### Manual Test Command
```bash
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.../image.png",
    "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
  }' | python3 -m json.tool | grep -E '"(feedbackApplied|overallScore)"'
```

### Expected Response
```json
{
  "overallScore": 6,
  "feedbackApplied": true,
  "feedbackDetails": {
    "priorUserScore": 8,
    "priorAIScore": 6,
    "correction": 2,
    "reasoning": "good skin texture and accurate clothing drawing"
  }
}
```

### Validation Status
- ✅ All 47 feedback entries valid
- ✅ All entries have matching files on disk
- ✅ Feedback being applied to analyses
- ✅ Server logs show [FEEDBACK APPLIED] flag
- ✅ Component scores correctly adjusted

---

## Deployment Notes

### Requirements
- Node.js v22+
- Google Cloud Vision API credentials
- `.ai-feedback.json` file in source folder (auto-created on first submission)

### Configuration
- Feedback file path: `{sourcePath}/.ai-feedback.json`
- API port: 3000
- Vision API integration: Required for image analysis

### Performance
- Feedback lookup: O(n) where n = number of entries (currently 47)
- Typical analysis time: 250-300ms (mostly Vision API)
- File I/O: Blocking (acceptable for current use)

---

## Future Improvements

1. **Database Migration** - Replace JSON with indexed database for faster lookups
2. **Batch Processing** - Process multiple images in parallel
3. **Pattern Learning** - ML model to predict scores based on feedback patterns
4. **Export/Import** - Ability to backup and restore feedback
5. **Analytics Dashboard** - Visual feedback statistics
