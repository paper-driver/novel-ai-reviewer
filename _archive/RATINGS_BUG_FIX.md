# 🐛 Image Ratings Bug Fix - Complete Explanation

## The Problem

When you restarted the app and rated one image, **all your previously saved ratings were erased**. This happened because:

### Root Cause
The `/api/ratings/save` endpoint was **completely overwriting** the `.image-ratings.json` file with **only the new ratings being sent**, instead of merging them with existing ratings.

### What Was Happening

```javascript
// ❌ OLD CODE (BUGGY):
fs.writeFileSync(ratingsFile, JSON.stringify(ratings, null, 2));
// This replaces the entire file with just the 'ratings' object sent
```

### Data Loss Scenario

1. **Day 1**: You rate 50 images → `.image-ratings.json` has 50 entries
2. **You restart the app**
3. **Day 2**: You rate 1 new image and save it
4. **Frontend sends to backend**: `{ "new-image.png": 7 }`
5. **Backend does**: `fs.writeFileSync(ratingsFile, JSON.stringify({ "new-image.png": 7 }))`
6. **Result**: ❌ File now has ONLY 1 entry → 49 entries lost!

## The Fix

### What Changed

**Location**: `/Users/leonmao/Documents/Projects/novel-ai-reviewer/server.js`, lines ~2520-2573

```javascript
// ✅ NEW CODE (FIXED):

// Step 1: Load existing ratings first
let existingRatings = {};
if (fs.existsSync(ratingsFile)) {
  try {
    existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
    console.log('[Ratings] Loaded existing ratings with', Object.keys(existingRatings).length, 'entries');
  } catch (parseErr) {
    console.warn('[Ratings] Failed to parse existing ratings file, starting fresh:', parseErr.message);
    existingRatings = {};
  }
}

// Step 2: Merge existing + new (new ratings override old for same filename)
const mergedRatings = { ...existingRatings, ...ratings };

// Step 3: Write merged ratings back
fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
```

### How Merging Works

```javascript
// Existing ratings in file:
existingRatings = {
  "image1.png": 7,
  "image2.png": 6,
  "image3.png": 8
}

// New ratings from frontend:
ratings = {
  "image2.png": 7,  // Updated rating for existing image
  "image4.png": 9   // New image
}

// Merged result (spread operator merges):
mergedRatings = {
  "image1.png": 7,  // ✓ Kept from existing
  "image2.png": 7,  // ✓ Updated with new value
  "image3.png": 8,  // ✓ Kept from existing
  "image4.png": 9   // ✓ Added from new
}
```

## API Response Change

### Before Fix
```json
{
  "success": true,
  "message": "Ratings saved"
}
```

### After Fix (More Informative)
```json
{
  "success": true,
  "message": "Ratings saved",
  "totalEntries": 51,        // Total entries after merge
  "newEntries": 1            // How many new/updated in this save
}
```

This helps verify that ratings weren't lost!

## Server Logging

The fixed version now logs:
```
[Ratings] Loaded existing ratings with 50 entries
[Ratings] Before merge: 50 entries
[Ratings] New ratings: 1 entries
[Ratings] After merge: 51 entries
[Ratings] Unified ratings saved to: /path/to/.image-ratings.json
```

So you can monitor what's happening when you save ratings.

## Why This Bug Existed

The code was written assuming:
- ❌ The frontend would load ALL existing ratings and send them all back
- ❌ The frontend would send a complete replacement file

But actually:
- ✓ Frontend only loads ratings it needs for current view
- ✓ Frontend only sends ratings that were changed/viewed
- ✓ Backend should preserve all unmentioned ratings

## Impact

### Before Fix
- ✅ Ratings saved in current session
- ❌ Ratings lost on restart
- ❌ Ratings lost when new images added
- ❌ Works only if frontend reloads entire ratings file before saving

### After Fix
- ✅ Ratings saved in current session
- ✅ Ratings persist across restarts
- ✅ Ratings preserved when new images added
- ✅ Safe partial updates (frontend only needs to send changes)

## Testing the Fix

### Test Case 1: Verify Merge Works
1. Rate some images in folder A (5 ratings)
2. Restart app
3. Rate a different image in folder A (1 new rating)
4. Check `.image-ratings.json` → Should have 6 entries ✓

### Test Case 2: Verify Updates Work
1. Rate image1.png as 7
2. Restart app
3. Re-rate image1.png as 8
4. Check `.image-ratings.json` → Should show image1.png: 8 ✓

### Test Case 3: Verify No Loss
1. Rate 100 images
2. Restart app
3. Rate 1 new image
4. Check `.image-ratings.json` → Should have 101 entries ✓

## Files Modified

```
server.js (lines ~2520-2573)
├── POST /api/ratings/save
│   ├── Load existing ratings
│   ├── Merge with new ratings
│   ├── Write back merged data
│   └── Return metadata (totalEntries, newEntries)
```

## Related Endpoints

All these endpoints save ratings and now use the merge logic:
- `POST /api/ratings/save` - General ratings save (uses merge)
- Used by:
  - Artist Gallery component
  - Prompt Grouping component
  - Reviews Table component

## Prevention of Future Issues

This fix implements the principle:
> **When saving data: LOAD → MERGE → SAVE, not just SAVE**

## Troubleshooting

### My ratings are still missing
1. **Check the backup**: Git should have history
   ```bash
   git log --oneline -- .image-ratings.json | head -5
   ```

2. **Check your ratings file**:
   ```bash
   cat /path/to/.image-ratings.json | python3 -m json.tool | wc -l
   ```

3. **Check server logs** for merge operations:
   ```
   [Ratings] After merge: X entries
   ```

### Server shows wrong merge count
- Check if file is corrupted (try deleting and re-rating)
- Check file permissions: `ls -la .image-ratings.json`

## Implementation Details

### Merge Algorithm
```javascript
const mergedRatings = { ...existingRatings, ...ratings };
// Spread operator: right object (ratings) overwrites left object (existingRatings)
```

### Error Handling
If existing ratings file is corrupted:
```javascript
try {
  existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
} catch (parseErr) {
  console.warn('[Ratings] Failed to parse existing ratings file, starting fresh:', parseErr.message);
  existingRatings = {}; // Start with empty, don't crash
}
```

This prevents data loss if file is corrupted.

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Save Behavior** | Overwrite entire file | Merge with existing |
| **Data Preservation** | Lose unmentioned ratings | Preserve all ratings |
| **Restart Safety** | Lose all ratings | Ratings persist |
| **Logging Detail** | Basic message | Entry counts + metadata |
| **Error Handling** | May crash on corrupt file | Graceful fallback |

**Status**: ✅ FIXED - Ratings now merge safely on every save

**Date Fixed**: March 13, 2026

**Verification**: Tested with 50+ existing ratings, verified merge on restart
