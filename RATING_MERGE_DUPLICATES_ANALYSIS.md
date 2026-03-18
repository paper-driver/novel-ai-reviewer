# Rating Merge Behavior for Duplicate Images

## Current Behavior

When both source and destination folders contain the **same image file** with **different ratings**:

### Example Scenario
```
Source:      {unique_source_img: 3, shared_image: 5}
Destination: {unique_dest_img: 7, shared_image: 8}
Image Files: 
  - shared_image.png exists in BOTH folders
  - unique_source_img.png only in source
  - unique_dest_img.png only in destination
```

### Image File Handling
```
copyGroupsFromSource() checks: if (!fs.existsSync(destFile))
- shared_image.png EXISTS in destination → NOT copied, SKIPPED
- unique_source_img.png NOT in destination → copied
```

### Current Ratings Merge Logic
```javascript
const mergedRatings = { ...sourceRatings, ...destRatings };
// Spread operator: destination values override source values for duplicate keys
```

### Result
```
Final ratings: {
  unique_source_img: 3,     ← from source
  shared_image: 8,          ← from destination (destination wins!)
  unique_dest_img: 7        ← from destination
}
```

## Question: Is This the Right Behavior?

### Scenario Analysis

**Scenario 1: Source is a copy of destination from previous session**
- User previously sorted images into destination
- Rated shared_image as 8 (their local rating)
- Later exports that folder as source for new session
- Expected: Keep local rating 8 ✅ CORRECT (destination takes precedence)

**Scenario 2: Source is a folder with better ratings**
- Source has ratings from expert curation (rating = 5)
- Destination has older casual ratings (rating = 8)
- User wants to update with source ratings
- Expected: Use source rating 5 ❌ WRONG (destination keeps rating 8)

**Scenario 3: Source is older, destination is newer**
- Source has outdated ratings (rating = 5)
- Destination has recent re-ratings (rating = 8)
- Expected: Keep destination rating 8 ✅ CORRECT

**Scenario 4: Duplicate images should have their ratings merged/averaged**
- Source rates shared_image as 5
- Destination rates shared_image as 8
- Expected: Average them (6.5) or sum them (13)
- Current: Take destination (8) ❌ MAYBE WRONG

## Decision Points

### Option A: Keep Current Behavior (Destination Precedence) ✅ RECOMMENDED
**Logic:** "Local ratings are more authoritative"
- ✅ Simple merge strategy
- ✅ Protects user's existing work
- ✅ Predictable (newer = better)
- ✅ Safe (no data loss)
- ❌ Ignores source ratings for duplicates

### Option B: Source Precedence
**Logic:** "Source is more recent/curated"
- ❌ Could overwrite good local ratings
- ❌ Dangerous for existing work
- ✅ Makes sense if source is always "better"
- ❌ Not safe

### Option C: Average Ratings
**Logic:** "Combine expert opinions"
- ❌ Assumes both ratings have equal validity
- ❌ Makes mathematical sense but not practical
- ✅ Preserves both inputs
- ❌ Creates non-integer ratings

### Option D: Show Conflict Dialog
**Logic:** "Let user decide"
- ✅ Most user-friendly
- ❌ Requires UI changes
- ❌ Breaks API design
- ❌ Complex implementation

### Option E: Use Higher Rating
**Logic:** "Take the better rating"
- ✅ Reasonable for quality metrics
- ✅ Never downgrades quality
- ✓ Makes sense if ratings = quality score
- ❌ Loses information if source rating is lower

## Recommendation

**Option A: Keep Current Behavior (Destination Precedence) ✅**

**Reasoning:**
1. **Safety First:** Protects user's local work by default
2. **Predictable:** Clear rule ("destination wins")
3. **Common Pattern:** Git merge strategy (local/ours takes precedence)
4. **Use Case:** Most common is copying groups, not updating ratings
5. **Reversible:** User can re-rate if needed

**For Users Who Want Source Ratings:**
They can:
1. Manually swap source/destination
2. Delete destination ratings first
3. Copy source folder alone

## Current Implementation Verdict

✅ **The current implementation is CORRECT for the intended use case**

The destination-takes-precedence strategy makes sense because:
- Destination is where the user is ACTIVELY WORKING
- Source is background import/copy operation
- User's current work should not be overwritten
- Follows principle of least surprise

## What Happens in Practice

```
Before copy-from-source:
  Source/.image-ratings.json = {shared_image: 5}
  Dest/.image-ratings.json = {shared_image: 8}

After copy-from-source:
  Dest/.image-ratings.json = {shared_image: 8}  ← unchanged
                            + {unique_source: 3}  ← added from source
```

The shared_image.png file is NOT copied (already exists), and its rating is NOT changed (destination rating preserved).
