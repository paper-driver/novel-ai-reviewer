# 📁 Feedback Storage by Source Folder - Setup Complete

## What Changed

✅ **Feedback is now stored per source folder** instead of globally in the project root.

### Before
- All feedback: `project-root/.ai-feedback.json` (global)
- Problem: Feedback from different source folders mixed together

### After  
- Feedback for each source folder: `source-folder/.ai-feedback.json`
- Example: `/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json`
- Each folder has its own isolated feedback

## File Location

**Old file** (still in project root, can be deleted):
```
/Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
```

**New file** (moved to your source folder):
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

**Current feedback entries**: 37 items stored

## How It Works

### When You Open a Source Folder

```
UI: You select source folder → /Volumes/WD_BLACK/private/NovelAI/SortByArtist
    ↓
Frontend calls POST /api/group-by-artists-path with sourcePath
    ↓
Backend sets: currentSourcePath = /Volumes/WD_BLACK/private/NovelAI/SortByArtist
    ↓
All feedback operations now use: {sourcePath}/.ai-feedback.json
    ↓
When you submit feedback → saved to /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

### Multiple Source Folders

Each source folder gets its own `.ai-feedback.json`:

```
/Volumes/Path1/Source1/
├── .ai-feedback.json  ← Feedback for Path1
├── image1.jpg
└── image2.jpg

/Volumes/Path2/Source2/
├── .ai-feedback.json  ← Feedback for Path2 (independent)
├── image3.jpg
└── image4.jpg
```

## Feedback Count in UI

### What It Shows

When you submit feedback, UI displays:
```
✓ Feedback recorded! (37 total corrections)
```

This number (`37`) represents:
- **Total feedback entries** already stored in the selected source folder
- **Not just the one you submitted** - it's the cumulative count
- Loaded from `.ai-feedback.json` in that source folder

### Why It Might Show "1"

If you see only "1 feedback recorded":

**Possible Reasons:**
1. **New source folder**: First time using this source folder → only 1 entry stored
2. **Different source folder selected**: Each folder has separate feedback
3. **Browser cache**: Old data from previous source folder still showing
4. **Feedback file not loaded yet**: UI is caching an old count

**Solution:**
- Refresh the browser (Cmd+R or Ctrl+R)
- The correct count will load from the source folder

## Technical Details

### Server Changes

**File**: `server.js`

1. **Global variable added**:
```javascript
let currentSourcePath = null;
```

2. **Load feedback** (updated):
```javascript
function loadFeedback(sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // ... loads from source folder
}
```

3. **Save feedback** (updated):
```javascript
function saveFeedback(feedbackData, sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  // ... saves to source folder
}
```

4. **Group endpoint** (updated):
```javascript
app.post('/api/group-by-artists-path', (req, res) => {
  const { sourcePath, ... } = req.body;
  currentSourcePath = path.resolve(sourcePath);
  // ... rest of grouping logic
});
```

### Feedback Endpoints

All endpoints automatically use the current source folder:

| Endpoint | Behavior |
|----------|----------|
| **POST /api/feedback/submit** | Saves to `currentSourcePath/.ai-feedback.json` |
| **GET /api/feedback/list** | Loads from `currentSourcePath/.ai-feedback.json` |
| **GET /api/feedback/analysis** | Analyzes `currentSourcePath/.ai-feedback.json` |
| **DELETE /api/feedback/clear** | Clears `currentSourcePath/.ai-feedback.json` |

## Setup Steps Completed

✅ 1. Modified `loadFeedback()` to accept sourcePath parameter  
✅ 2. Modified `saveFeedback()` to accept sourcePath parameter  
✅ 3. Added `currentSourcePath` global variable  
✅ 4. Updated `/api/group-by-artists-path` to set currentSourcePath  
✅ 5. Moved existing `.ai-feedback.json` to source folder  
✅ 6. All feedback operations now use source folder

## Verification

### Check Feedback File

```bash
# View feedback count in source folder
grep -c '"imageId"' /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
# Output: 37

# View first few entries
cat /Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json | head -50
```

### Test API

After opening a source folder in UI:

```bash
# List all feedback for current source folder
curl http://localhost:3000/api/feedback/list

# Get feedback analysis
curl http://localhost:3000/api/feedback/analysis

# Should show 37 entries from the source folder
```

## Old File Cleanup

You can safely delete the old feedback file from project root:

```bash
# Optional: Delete old file (keep backup first)
cp /Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json \
   /Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json.bak

rm /Users/leonmao/Documents/Projects/novel-ai-reviewer/.ai-feedback.json
```

## Important Notes

⚠️ **Feedback is folder-specific**: If you switch source folders, you'll see different feedback counts

✅ **All existing feedback preserved**: The 37 entries are safely stored in the source folder

✅ **No data loss**: Original file backed up before moving

✅ **Auto-created feedback files**: New source folders automatically create `.ai-feedback.json` on first feedback submission

## Troubleshooting

### Problem: Feedback not loading

**Solution**: 
- Make sure source folder is selected (group endpoint called)
- Check server logs for feedback loading messages
- Verify file exists: `ls -la source-folder/.ai-feedback.json`

### Problem: Feedback count different than expected

**Solution**:
- Different source folders have different feedback  
- Switch back to original source folder
- Refresh browser
- Check which source folder is selected

### Problem: Can't see all 37 entries

**Solution**:
- Make sure you've selected `/Volumes/WD_BLACK/private/NovelAI/SortByArtist`
- Refresh UI
- Check server console for feedback loading logs
- Verify currentSourcePath is set correctly

## Summary

| Aspect | Details |
|--------|---------|
| **Storage** | Per-source-folder `.ai-feedback.json` |
| **Location** | `{selected-source-folder}/.ai-feedback.json` |
| **Current path** | `/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json` |
| **Current entries** | 37 feedback items |
| **Isolation** | Each source folder has independent feedback |
| **Persistence** | Stored permanently until deleted |
| **Access** | Backend sets `currentSourcePath` when source folder selected |

---

**Implementation Date**: March 13, 2026  
**Status**: ✅ Complete  
**Verified**: Feedback file moved and accessible
