# Legacy Endpoints - Frontend Usage Reference

## Important: NO FRONTEND CHANGES REQUIRED ✅

The frontend code in `review.service.ts` can continue calling these endpoints exactly as before. The modular server now supports them with full compatibility.

## Endpoint 1: Group by Artists (Folder)

### Frontend Call (from review.service.ts:98)
```typescript
POST /api/group-by-artists/{{ folder }}
```

### Example
```typescript
this.http.post(`/api/group-by-artists/${folder}`, {})
```

### Response
```json
{
  "success": true,
  "sourceFolder": "review-123",
  "totalImages": 45,
  "groupCount": 8,
  "groups": {
    "oil-painting - digital-art": {
      "artistKey": "oil-painting | digital-art",
      "artists": ["oil-painting", "digital-art"],
      "count": 5,
      "images": ["img1.png", "img2.png", ...]
    },
    ...
  },
  "imageMetadata": [...]
}
```

### What Happens
1. Server groups images in `GENERATED_DIR/review-123/` by artist tags
2. Creates subfolders for each artist combination
3. Copies images to appropriate subfolders
4. Returns metadata about the grouping operation

---

## Endpoint 2: Group by Artists Path

### Frontend Call (from review.service.ts:108)
```typescript
POST /api/group-by-artists-path
```

### Example Request
```typescript
this.http.post('/api/group-by-artists-path', {
  sourcePath: '/path/to/source/images',
  destinationPath: '/path/to/destination/grouped',
  usePreSorted: false
})
```

### Response
```json
{
  "success": true,
  "sourceFolder": "/path/to/source/images",
  "destinationFolder": "/path/to/destination/grouped",
  "totalSourceImages": 50,
  "skippedImages": ["existing1.png", "existing2.png"],
  "skippedCount": 5,
  "imagesToProcess": 45,
  "newFoldersCreated": 3,
  "groups": {
    "artists-tag-1": {
      "artistKey": "artist | style",
      "artists": ["artist", "style"],
      "newCount": 15,
      "totalCount": 20,
      "images": [...]
    },
    ...
  },
  "imageMetadata": [...]
}
```

### What Happens

1. **First Time**: Creates artist folders in destination, copies all images (slow path)
2. **Subsequent Calls**: Skips already-copied images, only processes new ones (incremental)
3. **Auto-Detection**: If source has `_artist_mapping.json`, uses fast path
4. **Context Setting**: **CRITICAL** - Sets `currentSourcePath` for feedback storage

### Incremental Sync Example

**First call:**
- Input: 50 images at `/source/`
- Output: 50 images organized in `/destination/` by artist
- Mapping file created: `/destination/_artist_mapping.json`

**Second call with 10 new images at `/source/`:**
- Input: 60 images at `/source/` (50 old + 10 new)
- Output: Only 10 new images copied to `/destination/`
- Result: `skippedCount: 50, imagesToProcess: 10`

---

## Critical: Feedback Context Path

### Important!
When the frontend calls `/api/group-by-artists-path`, it **automatically** sets the context path for feedback storage.

**Why?** The server needs to know where to save feedback files (`.ai-feedback.json`).

**How?** The server stores the `sourcePath` and uses it when feedback is submitted.

**Example Flow:**
```
1. Frontend: POST /api/group-by-artists-path with sourcePath="/my/images"
   ↓
2. Server: Stores currentSourcePath="/my/images"
   ↓
3. Frontend: POST /api/feedback/submit { imageId: "img1", rating: 4 }
   ↓
4. Server: Saves feedback to "/my/images/.ai-feedback.json"
```

### No Code Changes Needed!
This side effect works automatically. The frontend doesn't need to do anything special.

---

## Migration Status

| Endpoint | Status | Frontend Changes | Notes |
|----------|--------|------------------|-------|
| POST /api/group-by-artists/:folder | ✅ Migrated | ✅ None | Works as before |
| POST /api/group-by-artists-path | ✅ Migrated | ✅ None | Incremental sync supported |

---

## Error Handling

### Invalid Folder (Endpoint 1)
```json
{
  "success": false,
  "error": "Folder not found"
}
```

### Missing Parameters (Endpoint 2)
```json
{
  "success": false,
  "error": "sourcePath and destinationPath are required"
}
```

### Invalid Paths (Endpoint 2)
```json
{
  "success": false,
  "error": "Source folder not found: /invalid/path"
}
```

---

## Testing

To verify the endpoints work:

```bash
# Test folder grouping
curl -X POST http://localhost:3000/api/group-by-artists/1

# Test path grouping
curl -X POST http://localhost:3000/api/group-by-artists-path \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePath": "/path/to/source",
    "destinationPath": "/path/to/dest",
    "usePreSorted": false
  }'
```

---

## Summary

✅ **Frontend works unchanged** - No modifications needed to `review.service.ts`

✅ **Full backward compatibility** - Endpoints behave identically to server.js

✅ **Feedback integration** - Context path automatically managed

✅ **Incremental sync** - Efficient repeated calls only process new images

✅ **Production ready** - All error cases handled properly
