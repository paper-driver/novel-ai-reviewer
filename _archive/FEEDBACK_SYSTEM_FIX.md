# Feedback System Fix - sourcePath Parameter Implementation

## Summary
Fixed the feedback system's critical issue where `currentSourcePath` was not being passed to feedback operations, causing all feedback to fail silently. The system was showing "1 feedback recorded" in the UI while the `.ai-feedback.json` file contained 37+ entries that weren't being persisted.

## Root Cause
1. Frontend was not sending `sourcePath` parameter when calling feedback endpoints
2. Backend had no way to know which folder's feedback file to use
3. All feedback operations silently failed due to missing source path context

## Changes Made

### 1. Backend Changes (server.js)

#### ✅ Updated `/api/feedback/submit` Endpoint
- Now accepts `sourcePath` in request body
- Falls back to `currentSourcePath` if not provided
- Returns error if neither is available
- Properly logs source path and entry count

```javascript
const sourcePath = req.body.sourcePath || currentSourcePath;
```

#### ✅ Updated `/api/feedback/analysis` Endpoint
- Now accepts `sourcePath` as query parameter
- Passes it to `loadFeedback(sourcePath)`
- Enables per-source feedback analysis

```javascript
const sourcePath = req.query.sourcePath || currentSourcePath;
```

#### ✅ Updated `/api/feedback/list` Endpoint
- Now accepts `sourcePath` as query parameter
- Retrieves feedback from the correct source folder

```javascript
const sourcePath = req.query.sourcePath || currentSourcePath;
```

#### ✅ Updated `/api/feedback/clear` Endpoint
- Now accepts `sourcePath` as query parameter
- Clears feedback from specific source folder

```javascript
const sourcePath = req.query.sourcePath || currentSourcePath;
```

### 2. Frontend Changes

#### ✅ Updated AiFeedbackService (ai-feedback.service.ts)

**submitFeedback() method:**
- Now accepts optional `sourcePath` parameter
- Includes `sourcePath` in request body
- Signature: `submitFeedback(feedback, sourcePath?)`

```typescript
submitFeedback(feedback: {
  imageId: string;
  aiScore: number;
  userScore: number;
  reasoning: string;
  components: any;
  sourcePath?: string;
}, sourcePath?: string): Observable<any> {
  const feedbackData = {
    ...feedback,
    sourcePath: sourcePath || feedback.sourcePath
  };
  return this.http.post(`${this.apiUrl}/submit`, feedbackData);
}
```

**getAnalysis() method:**
- Now accepts optional `sourcePath` parameter
- Passes it as query parameter

**listFeedback() method:**
- Now accepts optional `sourcePath` parameter
- Passes it as query parameter

**clearFeedback() method:**
- Now accepts optional `sourcePath` parameter
- Passes it as query parameter

#### ✅ Updated ImageViewerModalComponent (image-viewer-modal.component.ts)

**submitFeedback call:**
- Now includes `sourcePath` from `this.reviewData.folder`
- Adds to feedback data object
- Passes as second parameter to service method

```typescript
const feedbackData = {
  // ... other properties
  sourcePath: this.reviewData?.folder
};

this.aiFeedbackService.submitFeedback(feedbackData, this.reviewData?.folder).subscribe(
  // ...
);
```

## Verification

### Test Results
✅ Server logs show:
- Loaded 37 entries from source folder
- Successfully saved 38 entries (37 original + 1 new test entry)
- New entry properly tracked with sourcePath parameter
- Total entries correctly counted

### Before Fix
- UI: "1 feedback recorded"
- File: 37+ entries (not being updated)
- Root cause: sourcePath not passed, all operations failed silently

### After Fix
- UI: Shows correct feedback count based on actual file entries
- File: Feedback properly persisted to source folder's `.ai-feedback.json`
- Backend: Confirms sourcePath is being used for all operations

## How It Works Now

1. **User selects source folder** → `/api/group-by-artists-path` sets `currentSourcePath`
2. **User submits feedback** → Frontend passes `sourcePath` from `reviewData.folder`
3. **Backend receives feedback** → Uses sourcePath (or falls back to currentSourcePath)
4. **Feedback saved** → Written to `{sourcePath}/.ai-feedback.json`
5. **UI updates** → Shows accurate feedback count from actual file

## Files Modified
1. `server.js` - Backend endpoints updated (4 feedback endpoints)
2. `src/app/services/ai-feedback.service.ts` - Service methods updated
3. `src/app/components/image-viewer-modal/image-viewer-modal.component.ts` - Feedback submission updated

## Testing
To test the feedback system:
```bash
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d '{
    "imageId": "test.png",
    "aiScore": 7,
    "userScore": 8,
    "reasoning": "Test feedback",
    "components": {...},
    "sourcePath": "/path/to/source"
  }'
```

## Next Steps (Optional Improvements)
1. Add feedback UI indicator to show current source path
2. Add warning if submitting feedback without selecting source folder
3. Auto-infer sourcePath from image file location
4. Add feedback sync across multiple source folders
