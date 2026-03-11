# Incremental Artist Grouping Feature

## Overview

The artist grouping system now supports **idempotent/incremental sorting**, meaning:
- You can run the sorting process multiple times safely
- It won't duplicate or re-process images already sorted
- It reuses existing folders for matching artist combinations
- It automatically detects and avoids duplicate processing

---

## How It Works

### Step 1: Load Existing State

When sorting starts, the system first loads the `_artist_mapping.json` file if it exists:

```json
{
  "artistKey1": "folderName1",
  "artistKey2": "folderName2",
  ...
}
```

This mapping tracks:
- **Key**: Artist tag combination (canonical format with `|` separators)
- **Value**: Folder name (with ` - ` separators for filesystem)

The system also scans all existing folders in the destination to identify which image filenames are already there.

### Step 2: Identify New vs Existing Images

For each image in the source folder:

```
If image filename exists in any destination folder:
  → SKIP (already sorted)
Else:
  → Process (new image to sort)
```

### Step 3: Check for Matching Artist Combinations

For each new image, extract its artist combination:

```
If artist combination exists in mapping:
  → REUSE existing folder for this combo
  → Do NOT create new folder
Else:
  → CREATE new folder for new artist combo
  → Add to mapping
```

### Step 4: Copy Only New Images

Only copy images that:
1. Don't already exist in destination folders (by filename)
2. Haven't been processed before

---

## Response Format

The API now returns detailed information about the sorting operation:

```json
{
  "success": true,
  "sourceFolder": "/path/to/source",
  "destinationFolder": "/path/to/dest",
  "totalSourceImages": 19,           // Total files in source
  "skippedImages": [                 // Files already in dest
    "image1.png",
    "image2.png"
  ],
  "skippedCount": 2,                 // Count of skipped files
  "imagesToProcess": 17,             // Count to actually process
  "newFoldersCreated": 0,            // Newly created artist folders
  "groups": {
    "folderName": {
      "artistKey": "artist1 | artist2 | ...",
      "artists": [...],
      "newCount": 1,                 // NEW files copied
      "totalCount": 3,               // Total files in folder now
      "images": [...]
    }
  }
}
```

### Key Fields

- **skippedCount**: Images already in destination (not processed again)
- **imagesToProcess**: New images that were actually processed
- **newFoldersCreated**: New artist combination folders created (0 if reusing all)
- **newCount per group**: How many NEW images added to this folder in this run
- **totalCount per group**: Total images in folder after this run

---

## Example Scenario

### Run 1: Initial Sorting

**Source**: 18 new PNG images
**Destination**: Empty

```
Result:
  totalSourceImages: 18
  skippedCount: 0         ← No images skipped
  imagesToProcess: 18     ← All 18 processed
  newFoldersCreated: 4    ← 4 new artist combo folders created
```

Destination structure:
```
SortByArtist/
  [artist1] - [artist2] - [artist3]/
    image1.png (3 images total)
  [artist1] - [artist3] - [artist2]/
    image2.png (5 images total)
  [artist2] - [artist3]/
    image3.png (4 images total)
  [artist3]/
    image4.png (6 images total)
  _artist_mapping.json
```

### Run 2: Same Source, Rerun (Idempotent)

**Source**: Same 18 images (unchanged)
**Destination**: Same 4 folders from Run 1

```
Result:
  totalSourceImages: 18
  skippedCount: 18        ← ALL SKIPPED (already exist)
  imagesToProcess: 0      ← Nothing to do
  newFoldersCreated: 0    ← No new folders
```

**No files copied. No folders created. Completely safe!**

### Run 3: Add New Image with Existing Artist Combo

**Source**: Original 18 + 1 new image (same artist combo as one of the existing folders)
**Destination**: Same 4 folders from Run 1

```
Result:
  totalSourceImages: 19
  skippedCount: 18        ← Original 18 images skipped
  imagesToProcess: 1      ← 1 new image to process
  newFoldersCreated: 0    ← NO new folder created!
  groups: {
    "[artist1] - [artist2] - [artist3]": {
      "newCount": 1,      ← 1 new file added to existing folder
      "totalCount": 4     ← Folder now has 4 total files
    }
  }
```

**Result**: New image placed in EXISTING folder (matched by artist combo)

### Run 4: Add Image with NEW Artist Combo

**Source**: Original 18 + 1 new image with artists `[alice]`
**Destination**: Same 4 folders from Run 1

```
Result:
  totalSourceImages: 19
  skippedCount: 18        ← Original 18 images skipped
  imagesToProcess: 1      ← 1 new image
  newFoldersCreated: 1    ← NEW folder created
  groups: {
    "[alice]": {
      "newCount": 1,
      "totalCount": 1     ← New folder with 1 file
    }
  }
```

**Result**: NEW folder created for new artist combination

---

## Data Persistence

The `_artist_mapping.json` file is the key to incremental sorting:

### Format

```json
{
  "artistKey1 | artistKey2 | ...": "folderName1 - folderName2 - ...",
  "differentArtistKey | ...": "differentFolderName - ...",
  ...
}
```

### What It Tracks

- Every unique artist combination ever seen
- Which folder it's stored in
- Persists across runs (never deleted, only updated)

### Why It Matters

1. **Prevents duplicate folders**: If same artist combo seen again, reuses folder
2. **Fast lookups**: Quickly check if artist combo has been processed before
3. **Audit trail**: Shows which artist combos were discovered and where they're stored

---

## Benefits

### ✅ Idempotent Processing

- Run multiple times on same data = same result
- Safe to re-run if interrupted or to add images later

### ✅ Efficient

- Only processes new images (skips existing)
- Reuses folders when artist combos match
- Minimal file I/O on repeated runs

### ✅ Incremental Growth

- Start with 100 images → sort them
- Add 50 new images → sort again
- System automatically:
  - Skips original 100
  - Processes only 50
  - Reuses or creates folders as needed

### ✅ No Duplicates

- If image already sorted, it won't be copied again
- Even if filename is exactly the same
- Prevents wasted storage

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Same image filename twice in source | Only first occurrence processed |
| Image already in destination | Skipped in current run |
| Same artist combo, different folder source | Placed in existing folder |
| Same artist combo, different order/brackets | Different folder (as intended) |
| Very long artist combo names | Truncated + hash added |
| Mapping file corrupted/missing | Creates fresh mapping |

---

## Technical Implementation

### Key Functions

1. **Load existing state**
   - Read `_artist_mapping.json`
   - Scan destination folders for existing files
   - Build in-memory index

2. **Identify duplicates**
   - Check `existingImages` Set for each source file
   - O(1) lookup per file (efficient)

3. **Check artist combo**
   - Look up `artistKeyToFolder` map
   - If exists → reuse folder
   - If not → create new folder

4. **Report results**
   - Return counts of skipped vs processed
   - Show which folders were created vs reused
   - Provide audit trail

### Performance

- **First run**: ~N ms per image (metadata read + copy)
- **Incremental run** (all duplicates): ~N ms for validation, 0 ms for copying
- **Incremental run** (some new): Only new images processed

---

## API Examples

### Request (Custom Paths)

```bash
curl -X POST "http://localhost:3000/api/group-by-artists-path" \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePath": "/path/to/images",
    "destinationPath": "/path/to/sorted"
  }'
```

### Response (First Run)

```json
{
  "success": true,
  "totalSourceImages": 100,
  "skippedCount": 0,
  "imagesToProcess": 100,
  "newFoldersCreated": 5,
  "groups": {
    "artist1 - artist2": {
      "newCount": 20,
      "totalCount": 20,
      "images": [...]
    }
  }
}
```

### Response (Incremental Run - All Existing)

```json
{
  "success": true,
  "totalSourceImages": 100,
  "skippedCount": 100,
  "imagesToProcess": 0,
  "newFoldersCreated": 0,
  "groups": {}
}
```

---

## File Structure After Multiple Runs

```
SortByArtist/
  _artist_mapping.json             ← Updated after each run
  [artist1] - [artist2]/
    image1.png                      ← Original from run 1
    image2.png                      ← Original from run 1
    NEW_image.png                   ← Added in run 3
  [artist1]/
    image3.png
  [artist2] - [artist3] - [artist4]/
    image4.png
    image5.png
    new_artist_combo_image.png      ← Added in run 4 (matched combo)
```

Each folder accumulates images from multiple runs, reusing the same folder for matching artist combinations.

---

## Verification

To verify incremental sorting is working:

1. **Check response**: `skippedCount` > 0 indicates images were detected as existing
2. **Check newCount**: 0 = no new copies, >0 = files added to folder
3. **Check newFoldersCreated**: 0 = all artist combos matched existing, >0 = new combos found
4. **Verify mapping file**: Updated after each run, no duplicate entries

