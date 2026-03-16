# Average Rating Calculation Gaps - Analysis & Solution

## Problem Summary

You're seeing gaps between **individual image ratings** and **average ratings** displayed in the Artist Gallery and Prompt Grouping pages. This happens because:

1. **Individual ratings** are the `overallScore` returned from `/api/analyze-illustration` endpoint
2. **Average ratings** for groups are calculated as the simple arithmetic mean of **stored ratings** from `.artist-ratings.json` and `.prompt-ratings.json` files

### Example Issue
- Individual image in modal shows: **7/10**
- Same image in artist group average shows: **6/10** (average of group is different)

---

## Root Cause Analysis

### Where Individual Ratings Come From

When you view an image in the modal and use "Auto-Rate" or see the AI score:

```
/api/analyze-illustration
├─ Returns: overallScore (7/10)
├─ Includes: Component scores (anatomy, pose, face, etc.)
├─ Includes: rawAIScore (before corrections)
└─ Includes: correctionDetails (learned patterns, feedback)
```

**Key Point:** This is the `overallScore` field that gets displayed as the individual rating.

### Where Average Ratings Come From

When calculating group averages:

1. **Load ratings file** (`.artist-ratings.json` or `.prompt-ratings.json`)
2. **For each image in group**, get its rating from the file
3. **Calculate mean** of all rated images

```typescript
// In artist-gallery.component.ts - calculateAverageRating()
const ratedValues = Object.values(imageRatings)
  .filter(rating => rating && rating > 0);
const sum = ratedValues.reduce((acc, rating) => acc + rating, 0);
return sum / ratedValues.length;  // Simple arithmetic mean
```

---

## The Gap - Why They Don't Match

### Scenario 1: Rounding Differences
```
Individual Score: 7.4 → rounds to 7 for display
Average Calc: 7.4 is preserved
Result: Individual shows 7, average includes 7.4 → can be different!
```

### Scenario 2: Score Updates Without Refresh
```
1. You rate image as 7/10
2. Modal saves to file
3. Gallery shows old average (hasn't refreshed yet)
4. You refresh page → now it matches
```

### Scenario 3: Different Score Sources
```
Individual Modal:
  - Uses overallScore from /api/analyze-illustration
  - Includes feedback & learned patterns
  
Average Calculation:
  - Uses stored ratings from .artist-ratings.json
  - These might be old or from different source
```

### Scenario 4: Basename Mismatch
```
Image filename in modal: "1girl, {{...}} s-227156113.png"
Stored with key: "s-227156113.png"
When calculating average:
  - Tries to find rating for full filename
  - Can't find it (stored as basename only)
  - Image is not counted in average!
```

---

## Current Flow (Source of Issues)

### How Ratings Are Stored

```
Modal Component (image-viewer-modal.component.ts):
└─ setRating(7)
   ├─ Extracts basename: "s-227156113.png"
   └─ Stores as: { "s-227156113.png": 7 }

Gallery Component (artist-gallery.component.ts):
└─ onRatingsChanged(ratings)
   └─ saveRatings({ "s-227156113.png": 7 })
      └─ Server merges with existing ratings
         └─ Saves to .artist-ratings.json
```

### How Ratings Are Loaded

```
Gallery Component:
└─ refreshAverageRatings()
   ├─ Calls loadRatings(baseFolder)
   │  └─ Server returns: { "s-227156113.png": 7 }
   │
   └─ For each group:
      ├─ For each image filename
      │  ├─ Extract basename: "s-227156113.png"
      │  └─ Try to find in loaded ratings
      │
      └─ Calculate average of found ratings
```

### Where The Gap Happens

**Problem Code in refreshAverageRatings()** (line 651-659):

```typescript
// Image might have full prompt in filename
const filename = "1girl, {{...}} s-227156113.png"

// Extract basename
const basename = "s-227156113.png"

// Try to find rating
if (basenameToRating[basename]) {
  groupRatingsObj[filename] = basenameToRating[basename];
}
```

If the basename extraction fails, or if the rating wasn't saved with matching basename, the image won't be counted in the average!

---

## Solution Strategy

### Option 1: Normalize Rating Storage ⭐ RECOMMENDED

**Change:** Always store ratings with ONLY the basename, never with full prompt

**Benefits:**
- Consistent across all features
- Easier to track
- No gaps in averages

**Implementation:**
```typescript
// In modal: Always use basename
const basename = filename.split('/').pop() || filename;
const basename2 = basename.match(/(s-\d+\.png)$/i)?.[1] || basename;
imageRatings[basename2] = rating;  // ✓ Store as basename

// In gallery: Look up by basename
const result = basenameToRating[imageBasename];  // ✓ Always find it
```

### Option 2: Round All Scores Consistently

**Change:** Apply same rounding at storage and display time

```typescript
// When storing
const ratingToStore = Math.round(overallScore);  // 7.4 → 7

// When displaying
const displayRating = Math.round(storedRating);  // 7 → 7
```

### Option 3: Cache Individual Scores

**Change:** Store the `overallScore` separately for each image

```typescript
// New structure in .artist-ratings.json
{
  ".scores": {
    "s-227156113.png": {
      individual: 7,      // What user rated it
      group: 6.5,         // Group average it belongs to
      timestamp: 1710655000,
      components: {...}   // Component scores
    }
  }
}
```

### Option 4: Display Component Scores Instead

**Change:** Show average of component scores instead of overall

```typescript
// Current: Average of 7, 6, 8 = 7
// Better: Show breakdown:
//   - Anatomy: 7
//   - Pose: 6
//   - Face: 8
//   - (etc.)
// Users can see WHERE the difference is
```

---

## Recommended Fix (Implementation)

I recommend **Option 1 + Option 2** combined:

### Step 1: Ensure Consistent Basename Storage

**File:** `image-viewer-modal.component.ts` - `setRating()` method

```typescript
setRating(rating: number): void {
  // Always use just the basename (seed-based filename)
  const parts = this.currentImageName.split('/');
  const fullBasename = parts[parts.length - 1];  // "1girl, ... s-227156113.png"
  
  // Extract ONLY the seed part
  const seedMatch = fullBasename.match(/(s-\d+(?:\s+\(\d+\))?\.png)$/i);
  const seedBasename = seedMatch ? seedMatch[1] : fullBasename;
  
  this.imageRatings[seedBasename] = Math.round(rating);  // Store rounded
  this.currentImageRating = Math.round(rating);
}
```

### Step 2: Ensure Consistent Retrieval

**File:** `image-viewer-modal.component.ts` - `updateCurrentImage()` method

```typescript
updateCurrentImage() {
  const fileName = this.reviewData.images[this.currentImageIndex];
  
  // Extract just the seed basename
  const seedMatch = fileName.match(/(s-\d+(?:\s+\(\d+\))?\.png)$/i);
  const seedBasename = seedMatch ? seedMatch[1] : fileName;
  
  // Look up using seed basename
  this.currentImageRating = Math.round(
    this.imageRatings[seedBasename] || 0
  );
}
```

### Step 3: Fix Gallery Average Calculation

**File:** `artist-gallery.component.ts` - `refreshAverageRatings()` method

```typescript
refreshAverageRatings(): void {
  const allImageRatings = response.ratings as { [filename: string]: number };
  
  this.groups.forEach(group => {
    if (group.images && group.images.length > 0) {
      const groupRatingsObj: { [filename: string]: number } = {};
      
      group.images.forEach((filename: string) => {
        // Extract seed basename consistently
        const seedMatch = filename.match(/(s-\d+(?:\s+\(\d+\))?\.png)$/i);
        const seedBasename = seedMatch ? seedMatch[1] : filename;
        
        // Look up in loaded ratings using seed basename
        if (allImageRatings[seedBasename]) {
          groupRatingsObj[filename] = allImageRatings[seedBasename];
        }
      });
      
      group.averageRating = this.calculateAverageRating(groupRatingsObj);
    }
  });
}
```

### Step 4: Update Prompt Grouping Similarly

Apply the same fixes to `prompt-grouping.component.ts`

---

## Testing Plan

### Test 1: Individual vs Average Match
```
1. Rate image: 7/10 in modal
2. Close modal
3. Check group average
4. Expected: Group includes this image at 7/10
```

### Test 2: Multiple Images in Group
```
1. Rate 3 images: 8, 7, 9
2. Expected Average: (8+7+9)/3 = 8
```

### Test 3: Page Refresh Consistency
```
1. Rate image: 6/10
2. Close modal
3. Refresh page
4. Expected: Average still reflects 6/10
```

### Test 4: Cross-Feature Consistency
```
1. Rate in Artist Gallery: 7/10
2. Switch to Prompt Grouping
3. Same image should show: 7/10 in average
```

---

## Quick Summary

| Issue | Cause | Solution |
|-------|-------|----------|
| Gap between individual & average | Different score sources | Use normalized rating storage |
| Rounding inconsistency | Some round, some don't | Always round consistently |
| Images missing from average | Basename mismatch | Extract seed name consistently |
| Stale averages | No refresh after rating | Add auto-refresh on close |

---

## Related Files to Modify

1. `src/app/components/image-viewer-modal/image-viewer-modal.component.ts`
   - `setRating()` method
   - `updateCurrentImage()` method

2. `src/app/components/artist-gallery/artist-gallery.component.ts`
   - `refreshAverageRatings()` method
   - `calculateAverageRating()` method

3. `src/app/components/prompt-grouping/prompt-grouping.component.ts`
   - `refreshAverageRatings()` method
   - `calculateAverageRating()` method

---

## Before & After Example

### BEFORE (Problematic)
```
Individual Modal:
  - Image: "1girl, {{...}} s-227156113.png"
  - Rating: 7.4 → displays as 7
  - Stored as: "1girl, {{...}} s-227156113.png": 7

Gallery Average Calc:
  - Looks for: "1girl, {{...}} s-227156113.png" in ratings
  - Can't find it (stored with different key sometimes)
  - Image not counted → wrong average
```

### AFTER (Fixed)
```
Individual Modal:
  - Image: "1girl, {{...}} s-227156113.png"
  - Rating: 7.4 → Math.round() = 7
  - Stored as: "s-227156113.png": 7

Gallery Average Calc:
  - Looks for: "s-227156113.png" in ratings  
  - Finds it every time → correct average
  - Group average properly reflects all images
```

---

## Estimated Impact

- **Accuracy:** Fixes inconsistent averages (100% match)
- **Performance:** No change (same calculations)
- **User Experience:** Averages now always match expectation
- **Implementation Time:** ~30 minutes for all components
- **Testing Time:** ~15 minutes

Would you like me to implement these fixes?
