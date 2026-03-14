# 🎯 Feedback System - Quick Start Guide

## How to Use It

### Step 1: Analyze an Image
```
Open image in modal → Click "🎨 Analyze Art" → Wait for AI analysis
```

### Step 2: Give Feedback
```
Click new "💭 Give Feedback" button (pink gradient)
```

### Step 3: Adjust Score & Explain
```
Modal opens showing:
  ┌─────────────────────────────┐
  │  AI Score Feedback          │ X
  ├─────────────────────────────┤
  │                             │
  │ AI's Analysis               │
  │ Anatomy:    [████████]  8/10│
  │ Pose:       [██████]    6/10│
  │ Face:       [█████]     5/10│
  │ Background: [██████]    6/10│
  │ Objects:    [██████████] 9/10│
  │ Coherence:  [████████]  8/10│
  │                             │
  │ AI Score: 7/10              │
  │                             │
  ├─────────────────────────────┤
  │                             │
  │ Your Adjustment             │
  │ [—●——————] 1  2  3  4  5  6  7  8  9  10│
  │           6/10  (Same)      │
  │                             │
  │ Why adjust this score?      │
  │ ┌───────────────────────────┐│
  │ │ Face is weak even though..││
  │ │ anatomy looks good        ││
  │ │                           ││
  │ └───────────────────────────┘│
  │                             │
  │  [Cancel]    [Submit Feedback] │
  │                             │
  └─────────────────────────────┘
```

### Step 4: Submit
```
Click "Submit Feedback"
Message: "✓ Feedback recorded! (42 total corrections)"
```

## What Happens Behind the Scenes

1. **Your feedback is sent to server**
   ```json
   {
     "imageId": "s-1055117599.png",
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
   ```

2. **Server stores it**
   - Saved in `.ai-feedback.json`
   - Timestamp added automatically
   - Persists across sessions

3. **Pattern analysis learns**
   - After 5+ corrections, patterns emerge
   - System identifies:
     - Overall bias (AI scores too high/low?)
     - Component patterns (user values what?)
     - Recommendations for weight adjustment

## Check Your Learning Data

### View all feedback:
```bash
curl http://localhost:3000/api/feedback/list | python3 -m json.tool
```

### See what AI learned:
```bash
curl http://localhost:3000/api/feedback/analysis | python3 -m json.tool
```

**Output:**
```json
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
        "averageCorrection": 2.0,
        "insight": "When face ≥7, user adds ~2 points"
      },
      {
        "component": "objects",
        "averageScore": 8.4,
        "pattern": "User penalizes high object scores",
        "averageCorrection": -1.7,
        "insight": "When objects ≥8, user subtracts ~1.7 points"
      }
    ],
    "recentCorrections": [
      {
        "imageId": "img-42.png",
        "correction": -2,
        "reasoning": "Face weak"
      }
    ]
  }
}
```

## Key Insights

| Pattern | Meaning |
|---------|---------|
| "AI scores too high" | AI overestimates quality |
| "User rewards high X" | User likes good X quality |
| "User penalizes high Y" | User doesn't like high Y |
| Correction of +2 | Your score was 2 points higher |
| Correction of -2 | Your score was 2 points lower |

## Examples

### Example 1: After 10 corrections
```
Analysis Result:
- AI scores too high by 0.5 points
- User rewards face quality (+2.0 when face ≥7)
- User penalizes objects (-1.7 when objects ≥8)
```

**What this means:**
- AI's tendency to overshoot slightly
- Face quality is more important than AI thinks
- Objects should be valued less

**Suggestion:**
- Reduce all weights by 2-3%
- Increase face weight from 20% → 25%
- Reduce objects weight from 22% → 18%

### Example 2: Clear user preference
```
Analysis Result:
- User consistently penalizes anatomy (-1.8 when anatomy ≥8)
- User consistently rewards face (+2.1 when face ≥7)
```

**What this means:**
- Your taste: good anatomy alone isn't enough
- You value strong face quality above all
- You want AI to focus more on faces

## Feedback Loop

```
1. User provides corrections
   ↓
2. System learns patterns
   ↓
3. Patterns suggest weight adjustments
   ↓
4. Weights get updated (manual or auto)
   ↓
5. AI scores improve
   ↓
6. Less corrections needed
   ↓
7. Loop repeats with new preferences
```

## Tips for Best Results

1. **Be consistent**: If face is important to you, adjust scores consistently based on it
2. **Provide reasoning**: "Face weak" helps AI understand *what* matters
3. **Start with clear cases**: Start with images that are obviously too high/low
4. **Give variety**: Correct different types of images to build comprehensive model
5. **Watch for patterns**: After 20+ corrections, clear patterns usually emerge

## Troubleshooting

**Q: Feedback button doesn't appear?**
A: Click "🎨 Analyze Art" first. Feedback button only shows after analysis.

**Q: My feedback isn't saving?**
A: Check server is running: `curl http://localhost:3000/api/feedback/list`

**Q: How do I clear all feedback?**
A: Run: `curl -X DELETE http://localhost:3000/api/feedback/clear`

**Q: Can I edit feedback?**
A: Not yet - just submit new corrections. Multiple corrections on same image help AI learn.

## Next: Using Learned Weights

Once you have 20+ corrections, you can:
1. View the analysis and see what AI learned
2. Manually adjust weights based on recommendations
3. (Future) Auto-apply suggested weights
4. (Future) Create personalized models per folder

---

**Current Status**: ✅ Feedback system active and learning
**Server**: Running on port 3000
**Data**: Persistent in `.ai-feedback.json`

Ready to help AI learn your preferences! 🚀
