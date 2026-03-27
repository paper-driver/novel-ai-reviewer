# How Rating Merge Works When Destination Already Has The Same Image File

## Quick Answer

**If destination folder has the same image file from source folder:**

1. **Image File:** NOT copied (skipped, already exists)
2. **Image Rating:** Destination rating is PRESERVED (destination wins)

## Example

```
Source:      {shared_image.png: 5}
Destination: {shared_image.png: 8}
                          ↓
After merge: {shared_image.png: 8}  ← destination rating WINS
```

## How It Works

### Step 1: Image Copying
```javascript
// In copyGroupsFromSource() around line 215
if (!fs.existsSync(destFile)) {
  fs.copyFileSync(sourceFile, destFile);  // Only copy if NOT already there
  copiedImages++;
}
```

**Result:** 
- `shared_image.png` already exists in destination → **SKIPPED**
- File is NOT overwritten
- Same exact file remains in destination

### Step 2: Ratings Merge
```javascript
// In mergeRatingsFiles() around line 301
const mergedRatings = { 
  ...sourceRatings,     // {shared_image.png: 5}
  ...destRatings        // {shared_image.png: 8} ← overwrites source!
};
```

**Result:**
- JavaScript spread operator: later property overwrites earlier
- `shared_image.png: 8` from destination OVERWRITES `shared_image.png: 5` from source
- Destination rating is PRESERVED

## Visual Flow

```
Source has:      {img1: 5, shared: 5, img3: 3}
Destination has: {img2: 7, shared: 8, img4: 9}

Image Copying Step:
  img1 (source) → COPIED to destination ✓
  img3 (source) → COPIED to destination ✓
  shared (source) → SKIPPED (destination already has it) ✗
  
Rating Merge Step:
  merge({
    img1: 5,        (new from source)
    img3: 3,        (new from source)
    shared: 5,      (from source)
    img2: 7,        (existing in destination)
    shared: 8,      (from destination) ← overwrites source's 5
    img4: 9         (existing in destination)
  })
  
Final ratings:
  {
    img1: 5,        ← from source (new)
    img2: 7,        ← from destination (unchanged)
    img3: 3,        ← from source (new)
    img4: 9,        ← from destination (unchanged)
    shared: 8       ← from DESTINATION (preserved)
  }
```

## Merge Strategy: "Destination Wins"

### Why This Is The Right Choice

1. **Protects User Work**
   - Destination is where user is actively working
   - User's ratings should not be overwritten by imports
   - Safety first principle

2. **Consistent With Image Copying**
   - Image copying: destination files are preserved
   - Rating merge: destination ratings are preserved
   - Consistent behavior

3. **Git Merge Analogy**
   - Similar to `git merge --ours`
   - Local (destination) work takes precedence
   - Remote (source) only fills gaps

4. **Practical Use Case**
   - User rates `shared_image.png` as 8 in current session
   - Later imports old folder that has same image with rating 5
   - Expected: Keep their current rating (8)
   - Result: ✓ Gets rating 8 ✓

## Other Strategies Considered

### Option 1: Source Wins (Not Used ❌)
```javascript
const mergedRatings = { ...destRatings, ...sourceRatings };
```
**Problem:** Could overwrite user's good ratings with old ones

### Option 2: Average (Not Used ❌)
```javascript
shared: (5 + 8) / 2 = 6.5
```
**Problem:** Doesn't match real-world needs, creates decimals

### Option 3: Show Conflict (Not Used ❌)
```
Which rating do you want for shared_image.png?
[Source: 5] [Destination: 8]
```
**Problem:** Requires UI, breaks API design

### Option 4: Take Higher (Not Implemented ❌)
```javascript
shared: Math.max(5, 8) = 8
```
**Problem:** Assumes higher is always better

## Test Verification

### Actual Test Run

**Setup:**
```
Source ratings:      {unique_source.png: 3, shared_image.png: 5}
Destination ratings: {unique_dest.png: 7, shared_image.png: 8}
```

**API Response:**
```json
{
  "ratings": {
    "sourceCount": 2,
    "destinationCount": 2,
    "mergedCount": 3
  }
}
```

**Final Result:**
```json
{
  "unique_source.png": 3,
  "unique_dest.png": 7,
  "shared_image.png": 8
}
```

**Verification:** ✅
- ✅ Source rating (3) added for unique_source.png
- ✅ Destination rating (7) preserved for unique_dest.png
- ✅ Destination rating (8) WINS for shared_image.png
- ✅ Source rating (5) not used for shared_image.png
- ✅ No data loss
- ✅ Total count: 3 (2+2-1 duplicate)

## Conclusion

When the destination already has the same image file:

| Aspect | Behavior | Reason |
|--------|----------|--------|
| **Image File** | SKIPPED (not copied) | Avoid overwriting |
| **Image Rating** | Destination WINS | Protect user work |
| **Data Loss** | NONE | All ratings preserved |
| **Safety** | SAFE | Can't hurt existing work |
| **Predictability** | HIGH | Clear rule |

**Bottom Line:** Destination folder's existing work is fully protected. Source only adds new images and fills gaps in ratings.
