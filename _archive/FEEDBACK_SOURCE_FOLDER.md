# 📁 Feedback Storage - Per-Source Folder Implementation

## Overview

The feedback system has been updated to store feedback **in each source folder** instead of globally in the project root. This allows separate feedback tracking for different image collections.

## What Changed

### Before
```
Project Root/
├── .ai-feedback.json (global)  ← Stored all feedback for all sources
├── server.js
└── package.json
```

### After
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/
├── .ai-feedback.json  ← Per-source feedback
├── artist-folder-1/
├── artist-folder-2/
└── ...
```

## Key Features

✅ **Per-Source Storage**: Each source folder has its own `.ai-feedback.json`  
✅ **Automatic Path Tracking**: Sets `currentSourcePath` when grouping is initiated  
✅ **Backward Compatible**: Old feedback file copied to source folder  
✅ **Fallback**: Returns empty feedback if no source path set  

## How It Works

### 1. User Selects Source Folder

```
Frontend → API /api/group-by-artists-path
  with { sourcePath: "/Volumes/WD_BLACK/private/NovelAI/SortByArtist" }
         ↓
Backend sets: currentSourcePath = "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"
  ↓
All feedback operations now use this path
```

### 2. Feedback File Location

```javascript
// Pseudo code showing the flow

// User selects source folder
POST /api/group-by-artists-path
  currentSourcePath = "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"

// User submits feedback
POST /api/feedback/submit
  feedbackFile = /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
  Write feedback here ✓

// User analyzes image
POST /api/analyze-illustration
  feedbackFile = /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
  Check for prior feedback here ✓

// User views feedback
GET /api/feedback/list
  feedbackFile = /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
  Load feedback from here ✓
```

## Implementation Details

### Global Variable

```javascript
// Added to server.js (line ~30)
let currentSourcePath = null;
```

Tracks which source folder is currently active.

### Updated Functions

#### loadFeedback(sourcePath)
```javascript
/**
 * Load feedback data from source folder
 * @param {string} sourcePath - The source folder path. Uses currentSourcePath if not provided.
 */
function loadFeedback(sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  
  if (!folderPath) {
    console.warn('[Feedback] No source path available, returning empty feedback');
    return { entries: [] };
  }

  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // Read from source folder
}
```

#### saveFeedback(feedbackData, sourcePath)
```javascript
/**
 * Save feedback data to source folder
 * @param {object} feedbackData - The feedback data to save
 * @param {string} sourcePath - The source folder path. Uses currentSourcePath if not provided.
 */
function saveFeedback(feedbackData, sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  
  if (!folderPath) {
    console.error('[Feedback] No source path available, cannot save feedback');
    return;
  }

  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // Write to source folder
}
```

### Setting Current Source Path

In the `/api/group-by-artists-path` endpoint:

```javascript
app.post('/api/group-by-artists-path', (req, res) => {
  const { sourcePath, destinationPath, usePreSorted } = req.body;
  const resolvedSourcePath = path.resolve(sourcePath);
  
  // ===== NEW: Set current source path for feedback storage =====
  currentSourcePath = resolvedSourcePath;
  console.log(`[Feedback] Set current source path to: ${currentSourcePath}`);
  
  // ... rest of grouping logic
});
```

## API Usage

### Step 1: Initialize Source Folder

**Request:**
```bash
curl -X POST http://localhost:3000/api/group-by-artists-path \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist",
    "destinationPath": "/path/to/destination",
    "usePreSorted": false
  }'
```

**What happens:**
- `currentSourcePath` is set to `/Volumes/WD_BLACK/private/NovelAI/SortByArtist`
- Feedback file location is now: `/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json`
- All subsequent feedback operations use this path

### Step 2: Submit Feedback

**Request:**
```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "my-image.png",
    "aiScore": 7,
    "userScore": 6,
    "reasoning": "Face quality weak",
    "components": {
      "anatomy": 8, "pose": 6, "face": 5,
      "background": 6, "objects": 9, "coherence": 8
    }
  }'
```

**Stored at:**
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Step 3: Analyze Image (Applies Feedback)

**Request:**
```bash
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/Volumes/WD_BLACK/private/NovelAI/SortByArtist/folder/image.png"
  }'
```

**Looks for feedback in:**
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

## File Location Changes

### Before
```
File Storage:    /Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
Scope:           Global (all sources)
Per-source:      ❌ No
Migration:       N/A
```

### After
```
File Storage:    {sourcePath}/.ai-feedback.json
                 Example: /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
Scope:           Per-source
Per-source:      ✅ Yes
Migration:       Old file copied to source folder
```

## Server Logs

When initializing a source folder:

```
[Feedback] Set current source path to: /Volumes/WD_BLACK/private/NovelAI/SortByArtist
```

When submitting feedback:

```
[Feedback] Saved 42 feedback entries to /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

When analyzing with feedback:

```
[Illustration] Using prior feedback for image.png: Original AI=7/10 → User=6/10 (correction: -1)
[Illustration] Adjusted scores - Anatomy:8, Pose:6, Face:5, BG:6, Objects:9, Coherence:8
[Illustration] Recalculated overall score: 7/10 (from raw AI score: 7/10)
[Illustration] Analysis complete: 7/10 (70% confidence) [FEEDBACK APPLIED]
```

When no source path is set:

```
[Feedback] No source path available, returning empty feedback
```

## Migration Guide

### Existing Feedback

Old feedback file:
```
/Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
```

Has been copied to:
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

You can delete the old file if you want:
```bash
rm /Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
```

But it's kept for safety - it's just not being used anymore.

## Workflow

```
1. Open Web App
   ↓
2. Select Source Folder in UI
   ↓
3. Frontend calls: POST /api/group-by-artists-path
   ↓
4. Backend sets: currentSourcePath = selected folder
   ↓
5. Backend sets feedback file to: {sourcePath}/.ai-feedback.json
   ↓
6. User analyzes images
   ↓
7. Feedback is stored and loaded from source folder
   ↓
8. Switch to different source folder
   ↓
9. currentSourcePath changes
   ↓
10. Feedback now uses new folder's .ai-feedback.json
```

## Benefits

✅ **Isolation**: Each image collection has separate feedback  
✅ **Portability**: Feedback moves with the source folder  
✅ **Scalability**: Support multiple folders without conflicts  
✅ **Organization**: Feedback stays close to source data  
✅ **Easier Backup**: Backup entire folder with feedback included  

## Troubleshooting

### "No source path available"

**Cause**: You haven't called the grouping endpoint yet

**Fix**: First select a source folder in the UI:
1. Open Web App
2. Click "Select Source Folder"
3. Choose folder
4. Click "Group by Artists"
5. This triggers `/api/group-by-artists-path` which sets `currentSourcePath`

### Feedback Not Saving

**Check**:
1. Is the source folder path set? (check server logs for "Set current source path")
2. Is the source folder writable?
3. Does `.ai-feedback.json` exist in the folder?

**Solution**:
```bash
# Check if feedback file exists
ls -la /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json

# Check folder permissions
ls -ld /Volumes/WD_BLACK/private/NovelAI/SortByArtist

# Create feedback file if missing
echo '{"entries":[]}' > /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Can't Find Old Feedback

**Old location**: `/Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json`  
**New location**: `/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json`

If you switched source folders and can't find your feedback, check if you're using a different folder. Each folder has its own `.ai-feedback.json`.

## Technical Notes

- `currentSourcePath` is a global variable that persists for the server session
- Switching source folders requires calling `/api/group-by-artists-path` again
- If the app restarts, you need to select a source folder again
- Each source folder is independent - feedback doesn't mix between folders

## Future Improvements

Potential enhancements:
- Add API endpoint to explicitly set source path: `POST /api/set-source-path`
- Add endpoint to merge feedback from multiple folders
- Store source path in session/storage to persist across restarts
- Add UI indicator showing which folder's feedback is active

---

**Implementation Date**: March 13, 2026  
**Status**: ✅ Production Ready  
**Testing**: Verified with existing feedback migration
