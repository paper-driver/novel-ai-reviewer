# AI Feedback System - Option 1 + 5

## Overview

The AI feedback system allows users to correct AI scoring and help the system learn from corrections. Instead of endless weight tuning, the system learns patterns from user feedback.

## How It Works

### Option 5: Explanations First
When a user views an AI score, they see:
- **AI's Analysis**: Breakdown of each component (anatomy, pose, face, background, objects, coherence)
- **Current Score**: e.g., "AI Score: 7/10"

### Option 1: Feedback + Pattern Recognition
Users can:
1. Adjust the score with a slider
2. Explain why they adjusted it (e.g., "Face quality is weak")
3. Submit feedback

The system records:
```json
{
  "imageId": "image-filename",
  "aiScore": 7,
  "userScore": 6,
  "correction": -1,
  "reasoning": "Face quality is weak",
  "components": {
    "anatomy": 8,
    "pose": 6,
    "face": 5,
    "background": 6,
    "objects": 9,
    "coherence": 8
  },
  "timestamp": "2026-03-13T20:27:32.658Z"
}
```

## Backend API Endpoints

### 1. Submit Feedback
**POST** `/api/feedback/submit`

```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "image-1",
    "aiScore": 7,
    "userScore": 6,
    "reasoning": "Face is weak",
    "components": {
      "anatomy": 8,
      "pose": 6,
      "face": 5,
      "background": 6,
      "objects": 9,
      "coherence": 8
    }
  }'
```

### 2. Get Feedback Analysis
**GET** `/api/feedback/analysis`

Shows patterns learned from corrections:
```bash
curl http://localhost:3000/api/feedback/analysis
```

**Response:**
```json
{
  "status": "success",
  "feedbackCount": 5,
  "analysis": {
    "overallBias": {
      "description": "AI scores too high",
      "amount": 1,
      "recommendation": "..."
    },
    "componentPatterns": {
      "anatomy": {
        "avgScore": 7.4,
        "avgCorrectionWhenHigh": -1.7,
        "pattern": "User penalizes high anatomy"
      },
      "face": {
        "avgScore": 5.2,
        "avgCorrectionWhenHigh": 2,
        "pattern": "User rewards high face"
      }
      // ... other components
    },
    "recentCorrections": [...]
  }
}
```

### 3. List All Feedback
**GET** `/api/feedback/list`

### 4. Clear All Feedback
**DELETE** `/api/feedback/clear`

## Frontend Components

### AiFeedbackModalComponent
Standalone component for capturing feedback.

```typescript
<app-ai-feedback-modal
  [aiScore]="7"
  [components]="{ anatomy: 8, pose: 6, face: 5, background: 6, objects: 9, coherence: 8 }"
  (feedbackSubmitted)="onFeedbackSubmitted($event)"
  (closed)="onClosed()"
></app-ai-feedback-modal>
```

### AiFeedbackService
Service for API calls.

```typescript
import { AiFeedbackService } from './services/ai-feedback.service';

constructor(private feedbackService: AiFeedbackService) {}

// Submit feedback
this.feedbackService.submitFeedback({
  imageId: 'image-1',
  aiScore: 7,
  userScore: 6,
  reasoning: 'Face is weak',
  components: {...}
}).subscribe(result => {
  console.log('Feedback saved!', result);
});

// Get analysis
this.feedbackService.getAnalysis().subscribe(analysis => {
  console.log('AI patterns:', analysis);
});
```

## Feedback Data Storage

Feedback is stored in `.ai-feedback.json` at the project root:

```json
{
  "entries": [
    {
      "imageId": "image-1",
      "aiScore": 7,
      "userScore": 6,
      "correction": -1,
      "reasoning": "Face quality is weak",
      "components": {...},
      "timestamp": "2026-03-13T20:27:32.658Z"
    }
    // ... more entries
  ]
}
```

## Pattern Recognition

The system analyzes feedback to detect:

### Overall Bias
- Average correction across all images
- Indicates if AI scores too high/low
- Example: "AI scores too high by 1 point on average"

### Component Patterns
For each component (anatomy, pose, face, etc.):
- Average score when component is high (>=7)
- Average correction when that happens
- Pattern description: "User rewards high X" or "User penalizes high X"

### Example Analysis Output

```
Feedback Count: 5

Overall Bias:
  - AI scores too high
  - Amount: 1 point
  - Recommendation: Consider weight adjustments

Component Patterns:
  - Anatomy (avg 7.4): User penalizes high anatomy (-1.7)
  - Pose (avg 5.6): User rewards high pose (+2.0)
  - Face (avg 5.2): User rewards high face (+2.0)
  - Objects (avg 8.4): User penalizes high objects (-1.7)
  - Coherence (avg 7.6): Neutral (-0.7)

Recent Corrections:
  [Last 5 user adjustments]
```

## Next Steps (Phase 2)

With pattern data, you can:

1. **Auto-suggest weight adjustments** based on patterns
2. **Apply personalized weights** per folder
3. **Detect systematic bias** ("AI always overscores explicit content by 1.5 points")
4. **Build a feedback dashboard** showing learning progress
5. **Export analysis** for insights about your scoring preferences

## Testing the Feedback System

```bash
# Submit feedback
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{"imageId":"test1","aiScore":7,"userScore":6,"reasoning":"weak","components":{"anatomy":8,"pose":6,"face":5,"background":6,"objects":9,"coherence":8}}'

# Get analysis
curl http://localhost:3000/api/feedback/analysis | python3 -m json.tool

# List all
curl http://localhost:3000/api/feedback/list | python3 -m json.tool

# Clear (be careful!)
curl -X DELETE http://localhost:3000/api/feedback/clear
```
