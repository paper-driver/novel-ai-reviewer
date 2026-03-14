# Feedback System Architecture

## Component Hierarchy

```
App Component
├── Image Viewer Modal (INTEGRATED)
│   ├── Image Display
│   ├── Sidebar Metadata
│   │   ├── Rating Section
│   │   ├── Prompt Display
│   │   ├── AI Analysis Section
│   │   │   ├── "🎨 Analyze Art" button
│   │   │   └── "🚀 Analyze All" button
│   │   │       ↓ (After analysis appears)
│   │   │   ├── Analysis Results (6 component scores)
│   │   │   └── NEW: "💭 Give Feedback" button
│   │   │       ↓ (Opens)
│   │   │   └── AI Feedback Modal Component
│   │   │       ├── AI's Analysis Section
│   │   │       │   └── 6 Component Bars
│   │   │       ├── Your Adjustment Section
│   │   │       │   └── Score Slider
│   │   │       ├── Reasoning Section
│   │   │       │   └── Textarea
│   │   │       └── Actions
│   │   │           ├── Cancel Button
│   │   │           └── Submit Feedback Button
│   │   │               ↓ (Calls Service)
│   │   │           └── AiFeedbackService
│   │   │               ├── submitFeedback()
│   │   │               ├── getAnalysis()
│   │   │               ├── listFeedback()
│   │   │               └── clearFeedback()
│   │   │                   ↓ (HTTP Requests)
│   │   │               └── Backend API Endpoints
│   │   │                   ├── POST /api/feedback/submit
│   │   │                   ├── GET /api/feedback/analysis
│   │   │                   ├── GET /api/feedback/list
│   │   │                   └── DELETE /api/feedback/clear
│   │   │                       ↓ (Processes & Stores)
│   │   │                   └── Backend Storage
│   │   │                       └── .ai-feedback.json
│   └── Thumbnail Strip
└── Other Components (unaffected)
```

## Data Flow

### Feedback Submission Flow

```
┌─────────────────────────────────────────────────────────┐
│ User in Image Viewer Modal                              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks "🎨 Analyze Art"                        │
│    → autoRateCurrentIllustration()                      │
│    → Calls IllustrationQualityService                  │
│    → Sends image to Vision API                         │
│    → Results displayed in sidebar                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. New "💭 Give Feedback" button appears               │
│    (only if analysis succeeds)                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. User clicks "💭 Give Feedback"                      │
│    → openFeedbackModal()                                │
│    → showFeedbackModal = true                           │
│    → AiFeedbackModalComponent mounts                    │
│    → Displays current AI scores                         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. User adjusts score with slider                       │
│    → Updates userScore property                         │
│    → Computes correction (userScore - aiScore)          │
│    → Shows correction badge (red/green)                 │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. User provides reasoning (optional)                   │
│    → Types explanation in textarea                      │
│    → Example: "Face is weak"                            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. User clicks "Submit Feedback"                        │
│    → onFeedbackSubmitted(feedback)                      │
│    → Builds complete feedback object:                   │
│    {                                                    │
│      imageId: "s-1055117599.png",                      │
│      filePath: "/path/to/image",                        │
│      aiScore: 7,           (AI's original score)        │
│      userScore: 6,         (User's adjusted score)      │
│      correction: -1,       (userScore - aiScore)        │
│      reasoning: "Face is weak",                         │
│      components: {         (All 6 component scores)     │
│        anatomy: 8,                                      │
│        pose: 6,                                         │
│        face: 5,                                         │
│        background: 6,                                   │
│        objects: 9,                                      │
│        coherence: 8                                     │
│      }                                                  │
│    }                                                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 7. AiFeedbackService.submitFeedback(feedbackData)      │
│    → HTTP POST to /api/feedback/submit                  │
│    → Content-Type: application/json                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Backend (server.js)                                     │
│ POST /api/feedback/submit route                         │
│ 1. Receives feedback data                               │
│ 2. Loads existing .ai-feedback.json                     │
│ 3. Appends new entry with timestamp                     │
│ 4. Saves back to .ai-feedback.json                      │
│ 5. Returns { success: true, feedbackCount: N }          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Response received in ImageViewerModal                │
│    → onFeedbackSubmitted() handles response             │
│    → Displays success message:                          │
│      "✓ Feedback recorded! (42 total corrections)"      │
│    → Closes feedback modal                              │
│    → showFeedbackModal = false                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Feedback entry now in .ai-feedback.json:               │
│ {                                                       │
│   "imageId": "s-1055117599.png",                        │
│   "aiScore": 7,                                         │
│   "userScore": 6,                                       │
│   "correction": -1,                                     │
│   "reasoning": "Face is weak",                          │
│   "components": {...},                                  │
│   "timestamp": "2026-03-13T20:35:42.123Z"               │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
```

## Analysis Flow

```
curl http://localhost:3000/api/feedback/analysis
                         ↓
Backend GET /api/feedback/analysis route
                         ↓
1. Load .ai-feedback.json
   └─ Array of all feedback entries
                         ↓
2. Calculate Overall Bias
   └─ average correction = sum(all corrections) / count
   └─ If negative: AI scores too high
   └─ If positive: AI scores too low
                         ↓
3. Calculate Component Patterns (for each of 6 components)
   ├─ Filter entries where component ≥ 7
   ├─ Calculate avg correction for those entries
   └─ Pattern: "User penalizes/rewards high X"
                         ↓
4. Generate Recommendations
   ├─ If AI scores too high: reduce all weights
   ├─ If component pattern detected:
   │  └─ Adjust that component's weight
   └─ Provide specific % adjustment suggestions
                         ↓
5. Return Analysis JSON
   ├─ overallBias object
   ├─ componentPatterns array (6 items)
   ├─ recentCorrections array (5 items)
   └─ feedbackCount
                         ↓
Frontend receives & displays
```

## File Locations

### Frontend Files
```
src/
├── app/
│   ├── components/
│   │   ├── image-viewer-modal/
│   │   │   ├── image-viewer-modal.component.ts (MODIFIED)
│   │   │   ├── image-viewer-modal.component.html (MODIFIED)
│   │   │   └── image-viewer-modal.component.scss (MODIFIED)
│   │   └── ai-feedback-modal/
│   │       ├── ai-feedback-modal.component.ts (FIXED - no Material)
│   │       └── (inline template + styles in component)
│   └── services/
│       ├── ai-feedback.service.ts (EXISTING)
│       └── (other services)
```

### Backend Files
```
├── server.js (MODIFIED - 4 new endpoints)
└── .ai-feedback.json (CREATED on first feedback submission)
```

## Service Architecture

### AiFeedbackService

```typescript
@Injectable({ providedIn: 'root' })
export class AiFeedbackService {
  private baseUrl = 'http://localhost:3000/api/feedback';
  
  constructor(private http: HttpClient) {}
  
  // Send feedback for an image
  submitFeedback(feedback: FeedbackData): Observable<FeedbackResponse> {
    return this.http.post<FeedbackResponse>(`${baseUrl}/submit`, feedback);
  }
  
  // Get pattern analysis from collected feedback
  getAnalysis(): Observable<AnalysisResponse> {
    return this.http.get<AnalysisResponse>(`${baseUrl}/analysis`);
  }
  
  // List all feedback entries
  listFeedback(): Observable<FeedbackListResponse> {
    return this.http.get<FeedbackListResponse>(`${baseUrl}/list`);
  }
  
  // Clear all feedback (for testing/resetting)
  clearFeedback(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${baseUrl}/clear`);
  }
}
```

## Backend Endpoints

### 1. POST /api/feedback/submit
```
Request:
{
  "imageId": "s-1055117599.png",
  "filePath": "/path/to/image",
  "aiScore": 7,
  "userScore": 6,
  "correction": -1,
  "reasoning": "Face is weak",
  "components": {
    "anatomy": 8,
    "pose": 6,
    "face": 5,
    "background": 6,
    "objects": 9,
    "coherence": 8
  }
}

Response:
{
  "success": true,
  "entry": {...}, // full saved entry
  "feedbackCount": 42
}
```

### 2. GET /api/feedback/analysis
```
Response (requires ≥5 entries):
{
  "success": true,
  "feedbackCount": 42,
  "analysis": {
    "overallBias": {
      "description": "AI scores too high by 1 point",
      "amount": 1,
      "recommendation": "Consider reducing all weights by ~5%"
    },
    "componentPatterns": [
      {
        "component": "face",
        "averageScore": 5.2,
        "pattern": "User rewards high face quality",
        "averageCorrection": 2.0
      },
      // ... 5 more components
    ],
    "recentCorrections": [
      { "imageId": "img-1", "correction": -1, "reasoning": "..." },
      // ... 4 more
    ]
  }
}
```

### 3. GET /api/feedback/list
```
Response:
{
  "entries": [
    {
      "imageId": "s-1055117599.png",
      "aiScore": 7,
      "userScore": 6,
      "correction": -1,
      "reasoning": "Face is weak",
      "components": {...},
      "timestamp": "2026-03-13T20:35:42.123Z"
    },
    // ... more entries
  ]
}
```

### 4. DELETE /api/feedback/clear
```
Response:
{ "success": true }
```

## Data Structures

### FeedbackEntry (what gets stored)
```typescript
{
  imageId: string,          // filename
  filePath: string,         // full path (optional)
  aiScore: number,          // 1-10, AI's original score
  userScore: number,        // 1-10, user's adjusted score
  correction: number,       // userScore - aiScore
  reasoning: string,        // user's explanation
  components: {             // all 6 component scores
    anatomy: number,
    pose: number,
    face: number,
    background: number,
    objects: number,
    coherence: number
  },
  timestamp: string         // ISO 8601
}
```

### ComponentPattern (what AI learns)
```typescript
{
  component: string,        // "anatomy", "pose", etc.
  averageScore: number,     // avg score when component ≥ 7
  pattern: string,          // "User rewards/penalizes high X"
  averageCorrection: number,// how much user adjusted when high
  insight: string          // human-readable explanation
}
```

## Storage

### .ai-feedback.json
- Plain JSON file, one feedback entry per line (conceptually)
- Stored at project root
- Persists across sessions
- Human-readable format
- Can be backed up/shared

Example:
```json
[
  {
    "imageId": "s-1055117599.png",
    "aiScore": 7,
    "userScore": 6,
    "correction": -1,
    "reasoning": "Face is weak",
    "components": {"anatomy": 8, "pose": 6, "face": 5, "background": 6, "objects": 9, "coherence": 8},
    "timestamp": "2026-03-13T20:27:32.658Z"
  },
  // ... more entries
]
```

## Extensibility

### Ready for future features:
1. **Per-folder weights**: Store `.ai-weights-{hash}.json` for each folder
2. **Personalization**: Load folder-specific weights when analyzing
3. **Dashboard**: Create analytics UI to show learning progress
4. **Auto-adjustment**: Automatically update weights after N corrections
5. **Export/Import**: Share feedback/weights across machines
6. **ML Model**: Use feedback as training data for custom model

---

**Architecture Status**: ✅ Production-Ready
**Extensibility**: ✅ Designed for future features
**Performance**: ✅ Optimized for responsive UI
