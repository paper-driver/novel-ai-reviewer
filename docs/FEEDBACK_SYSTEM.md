# 🎯 AI Feedback System - Complete Guide

## Overview

The AI Feedback System allows you to correct AI ratings and help the system learn your preferences. Your feedback is stored and automatically applied to future analyses of the same images.

---

## 🚀 Quick Start

### Using the Feedback System

1. **Analyze an image** → Click "🎨 Analyze Art" button
2. **Open feedback** → Click "💭 Give Feedback" (pink button)
3. **Adjust score** → Use slider to set your rating (1-10)
4. **Add reasoning** → Explain why you adjusted it
5. **Submit** → Click "Submit Feedback"

### Example
```
Image: kitagawa marin s-1011156380.png

AI Analysis:
  Anatomy: 5/10
  Pose: 6/10
  Face: 6/10
  Background: 6/10
  Objects: 4/10
  Coherence: 7/10
  Overall: 6/10

Your Feedback:
  Your Score: 8/10 (+2)
  Reasoning: "good skin texture and accurate clothing drawing"
  
Result: ✓ Feedback recorded (47 total corrections)
```

---

## 📊 How It Works

### Storage
- **Location**: `.ai-feedback.json` in your source folder
- **Format**: JSON with image IDs, scores, timestamps, and reasoning
- **Persistence**: Survives application restarts
- **Per-source**: Each source folder tracks its own feedback

### Application
When analyzing an image:
1. AI generates initial scores
2. System checks for prior feedback
3. If feedback exists, component scores are corrected
4. Overall score is recalculated
5. Analysis includes `[FEEDBACK APPLIED]` flag

### Current Status
```
✅ Total Entries: 47
✅ Valid Entries: 47 (100%)
✅ System Active: YES
✅ Feedback Being Applied: YES
```

---

## 📈 Your Feedback Patterns

### Overall Statistics
```
User Rating Behavior:
  • Average rating: 6.7/10
  • AI's average: 6.1/10
  • Your tendency: +0.6 points higher
  • Most common correction: +2 points (15 entries)
```

### Character Preferences
```
Asuna:           +2.0 avg (2 images)
Hoshino Ai:      +1.2 avg (4 images)
Nobara:          +0.7 avg (6 images)
Ayase Momo:      +0.6 avg (11 images)
Kitagawa Marin:  +0.1 avg (19 images)
```

### Correction Distribution
```
Corrections above AI score:  63% of ratings
Corrections below AI score:  23% of ratings
Corrections same as AI:      12% of ratings

Significant corrections (±2+ points):
  • +2 or higher: 16 entries
  • -2 or lower: 7 entries
```

---

## 💾 Feedback File Structure

### File Location
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Example Entry
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

---

## 🔧 API Endpoints

### Submit Feedback
```bash
POST /api/feedback/submit
Content-Type: application/json

{
  "imageId": "s-1011156380.png",
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
  "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
}
```

### List All Feedback
```bash
GET /api/feedback/list?sourcePath=/Volumes/WD_BLACK/private/NovelAI/SortByArtist

Response: Array of all feedback entries
```

### Analyze Feedback Patterns
```bash
GET /api/feedback/analysis?sourcePath=/Volumes/WD_BLACK/private/NovelAI/SortByArtist

Response: Statistics about user's rating patterns
```

### Apply Feedback to Analysis
```bash
POST /api/analyze-illustration
Content-Type: application/json

{
  "filePath": "/Volumes/WD_BLACK/.../image.png",
  "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
}

Response includes:
  "feedbackApplied": true,
  "feedbackDetails": {
    "priorUserScore": 8,
    "priorAIScore": 6,
    "correction": 2,
    "reasoning": "..."
  }
```

### Clear All Feedback
```bash
DELETE /api/feedback/clear?sourcePath=/Volumes/WD_BLACK/private/NovelAI/SortByArtist
```

---

## 🐛 Troubleshooting

### Feedback Not Applying?

**Check 1: Is the server running?**
```bash
ps aux | grep "node server" | grep -v grep
```

**Check 2: Is the feedback file present?**
```bash
ls -la /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

**Check 3: Test a known image**
```bash
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{"filePath":"...image.png","sourcePath":"..."}'
```

Look for `"feedbackApplied": true` in response.

### Corrupted Feedback File?

Use the cleanup utility:
```bash
cd /Volumes/WD_BLACK/private/NovelAI/SortByArtist
node /path/to/cleanup-feedback.js
```

This removes entries for non-existent images and creates a backup.

---

## 🎓 Technical Details

### Component Scoring
```
Anatomy (20%):     Proportions, anatomy accuracy
Pose (15%):        Posture, positioning, naturalness
Face (20%):        Facial features, expression quality
Background (15%):  Environment, detail, composition
Objects (15%):     Props, clothing, item accuracy
Coherence (15%):   Overall harmony, style consistency

Overall Score = 
  (Anatomy × 0.20) +
  (Pose × 0.15) +
  (Face × 0.20) +
  (Background × 0.15) +
  (Objects × 0.15) +
  (Coherence × 0.15)
```

### Data Flow
```
User submits feedback
        ↓
Frontend sends to /api/feedback/submit
        ↓
Server saves to .ai-feedback.json
        ↓
Next analysis checks .ai-feedback.json
        ↓
Component scores corrected if match found
        ↓
Overall score recalculated
        ↓
Response includes feedbackApplied flag
```

---

## ✅ System Status

### Current Implementation
- ✅ Feedback submission working
- ✅ Component score corrections applied
- ✅ All 47 entries valid and active
- ✅ Per-source feedback storage
- ✅ API endpoints functional
- ✅ Server logs confirmation

### Validation Results
- ✅ 47/47 entries have matching image files
- ✅ 0 corrupted entries
- ✅ All entries properly formatted
- ✅ Timestamps recorded for all

### Live Test Results
```
Image: kitagawa marin s-1011156380.png
User Score: 8/10
AI Score: 6/10
Correction: +2
Status: [FEEDBACK APPLIED] ✅
```

---

## 📝 Next Steps

1. Continue submitting feedback for images you rate
2. System will accumulate more corrections over time
3. Patterns will become clearer with more data
4. Consider which characters you consistently rate differently
5. Monitor feedback statistics to see your preferences evolve

For detailed API documentation, see `API_REFERENCE.md`
