# 📋 Quick Reference - Feedback Storage in Source Folders

## ✅ What Was Done

Your feedback storage has been migrated from the project root to individual source folders. This means:

| Aspect | Before | After |
|--------|--------|-------|
| **Storage Location** | Project Root | Source Folder |
| **File Path** | `.ai-feedback.json` (global) | `{source}/.ai-feedback.json` |
| **Example** | `~novel-ai-reviewer/.ai-feedback.json` | `/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json` |
| **Feedback Scope** | All images mixed | Per-source isolated |
| **Entries** | 37 (all together) | 37 (in source folder) |

## 📍 Current Status

```
✅ Global variable currentSourcePath added
✅ loadFeedback() updated to read from source
✅ saveFeedback() updated to write to source  
✅ /api/group-by-artists-path sets currentSourcePath
✅ All feedback endpoints use source folder
✅ Old feedback file copied to source folder
✅ All 37 entries preserved and accessible
✅ Server running and ready
```

## 🔄 How It Works

### 1️⃣ User Selects Source Folder
```
UI: "Select Source Folder"
  → Choose: /Volumes/WD_BLACK/private/NovelAI/SortByArtist
  → Click: "Group by Artists"
```

### 2️⃣ Backend Sets Feedback Path
```javascript
currentSourcePath = "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
// All feedback operations now use:
// /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### 3️⃣ Feedback Operations Use Source Folder
```
✓ Submit feedback → Saved to source folder
✓ Analyze image → Loads from source folder
✓ List feedback → Reads from source folder
✓ Clear feedback → Deletes from source folder
```

## 📊 Feedback File Locations

### Old Location (Still There, Not Used)
```
/Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
Status: ✓ File exists | ✗ Not being used anymore
Entries: 37 (same as new location)
```

### New Location (Active)
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
Status: ✓ File exists | ✓ Being used now
Entries: 37 (migrated from old location)
```

## 🧪 Testing

### Test 1: Verify Files Exist
```bash
# New location (active)
ls -lh /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
# Output: 17K file with 37 entries

# Old location (backup)
ls -lh ~/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
# Output: 17K file - same entries
```

### Test 2: Check Server Logs
```
Look for these messages in server console:
✓ "[Feedback] Set current source path to: ..."
✓ "[Feedback] Saved X feedback entries to ..."
✓ "[Illustration] Using prior feedback for ..."
```

### Test 3: Submit New Feedback
```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "test.png",
    "aiScore": 7,
    "userScore": 8,
    "components": {"anatomy":8,"pose":8,"face":8,"background":8,"objects":8,"coherence":8}
  }'

# Verify it was saved to:
# /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

## 🎯 Key Points

### When You:
1. **Start the app** → No source path set yet, feedback unavailable
2. **Select a source folder** → currentSourcePath is set, feedback ready
3. **Rate an image** → Feedback saved to source folder
4. **Analyze an image** → Prior feedback loaded from source folder
5. **Switch source folders** → Feedback switches to new folder
6. **Restart the app** → Need to select source folder again

### Important:
- ⚠️ currentSourcePath is **session-based** (resets on server restart)
- ✅ Feedback is **persistent** (stored in files, survives server restart)
- 🔄 Each source folder has **independent** feedback
- 📂 Feedback travels with the source folder

## 📝 API Endpoints Summary

| Endpoint | What It Does | Uses |
|----------|-------------|------|
| `POST /api/group-by-artists-path` | Sets currentSourcePath | None (sets it) |
| `POST /api/feedback/submit` | Saves feedback to source | currentSourcePath |
| `GET /api/feedback/list` | Loads feedback from source | currentSourcePath |
| `GET /api/feedback/analysis` | Analyzes source feedback | currentSourcePath |
| `DELETE /api/feedback/clear` | Clears source feedback | currentSourcePath |
| `POST /api/analyze-illustration` | Applies source feedback | currentSourcePath |

## 🚨 If No Source Path is Set

```
GET /api/feedback/list
Response: {"entries":[]}
Log: "[Feedback] No source path available, returning empty feedback"

POST /api/feedback/submit
Response: Error (Cannot save without source path)
Log: "[Feedback] No source path available, cannot save feedback"
```

**Solution**: Select a source folder in the UI first!

## 📂 File Structure Example

```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/
├── .ai-feedback.json              ← Feedback (37 entries)
├── da_mao_banlangen/
│   ├── image1.png
│   ├── image2.png
│   └── ...
├── j.k. - blushyspicy/
│   ├── image3.png
│   ├── image4.png
│   └── ...
└── ... other folders ...

Note: .ai-feedback.json contains ALL feedback for ALL images
      in this source folder
```

## 🔍 Server Console Output Example

```
Review server listening on port 3000

User selects source folder:
[Feedback] Set current source path to: /Volumes/WD_BLACK/private/NovelAI/SortByArtist

User submits feedback:
[Feedback] Saved 38 feedback entries to /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json

User analyzes image with prior feedback:
[Illustration] Using prior feedback for image.png: Original AI=7/10 → User=6/10 (correction: -1)
[Illustration] Adjusted scores - Anatomy:8, Pose:6, Face:5, BG:6, Objects:9, Coherence:8
[Illustration] Recalculated overall score: 7/10 (from raw AI score: 7/10)
[Illustration] Analysis complete: 7/10 (70% confidence) [FEEDBACK APPLIED]
```

## ✨ Benefits Summary

✅ **Per-Source Isolation**
- Each folder has independent feedback
- No mixing between collections

✅ **Portability**
- Feedback moves with source folder
- Easy to backup/restore

✅ **Organization**
- Feedback stored near source data
- Logical grouping

✅ **Scalability**
- Support unlimited source folders
- No performance impact

✅ **Backward Compatible**
- All old feedback preserved
- No data loss

## 🎓 Complete Workflow

```
1. Open Web App
   └─ currentSourcePath = null
      └─ Feedback: unavailable

2. Select Source Folder → /Volumes/WD_BLACK/private/NovelAI/SortByArtist
   └─ POST /api/group-by-artists-path
      └─ currentSourcePath = /Volumes/WD_BLACK/private/NovelAI/SortByArtist
         └─ Feedback: available (37 entries loaded)

3. Browse Images
   └─ Can view, rate, analyze

4. Rate Image 1
   └─ POST /api/feedback/submit
      └─ Saved to: /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
         └─ Entry count: 38 now

5. Rate Image 2
   └─ POST /api/feedback/submit
      └─ Saved to: /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
         └─ Entry count: 39 now

6. Analyze Previously Rated Image 1
   └─ POST /api/analyze-illustration
      └─ loadFeedback() → Finds entry for Image 1
         └─ Returns: feedbackApplied: true, with prior rating
            └─ You see: "FEEDBACK APPLIED"

7. (Optional) Switch to Different Source Folder
   └─ currentSourcePath = /new/path
      └─ All feedback now uses /new/path/.ai-feedback.json
         └─ Previous ratings not affected (still in old folder)
```

---

**Status**: ✅ Ready to Use  
**Feedback Files**: ✅ Migrated (37 entries)  
**Server**: ✅ Running on port 3000  
**Documentation**: FEEDBACK_SOURCE_FOLDER.md, FEEDBACK_MIGRATION_SUMMARY.md
