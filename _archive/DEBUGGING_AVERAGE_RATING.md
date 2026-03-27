# Debugging Average Rating Issue - Step by Step

## Issue Summary
You rate 4 images as: 5, 5, 7, 7
Expected average: (5+5+7+7)/4 = **6**
Actual average: **7**

---

## Debugging Steps

### Step 1: Open Browser Console
1. Open your application in Chrome/Firefox
2. Press `F12` to open DevTools
3. Go to **Console** tab
4. You should see detailed logs with `[ArtistGallery]` prefix

### Step 2: Navigate to Artist Gallery  
1. Click on "Sort by Artist"
2. Watch the console logs as it loads

### Step 3: Look for These Specific Logs

```
[ArtistGallery] Loading ratings from: <folder-path>
[ArtistGallery] Loaded ratings from server: { success: true, ratings: {...} }
[ArtistGallery] All image ratings from file: { ... }
[ArtistGallery] Total ratings count: X
[ArtistGallery] Basename to rating map: { ... }
```

**IMPORTANT**: Copy-paste the actual values from the console.

### Step 4: Rate Images

1. Open a group with multiple images
2. Rate each image: 5, 5, 7, 7
3. **Open browser DevTools Console again**
4. Look for these logs:

```
[ArtistGallery] Ratings changed: { 
  "s-XXXXXXX.png": 5,
  "s-YYYYYYY.png": 5,
  ...
}
[ArtistGallery] Ratings from modal: {...}
[ArtistGallery] Loading existing ratings from: <path>
[ArtistGallery] All existing ratings: {...}
[ArtistGallery] Merged ratings: {...}
```

### Step 5: After Closing Modal, Check These Logs

```
[ArtistGallery] Refreshing average ratings from base folder: <path>
[ArtistGallery] All image ratings from file: {
  "s-XXXXXXX.png": 5,
  "s-YYYYYYY.png": 5,
  "s-ZZZZZZZ.png": 7,
  "s-WWWWWWW.png": 7
}
[ArtistGallery] Basename to rating map: {...}

[ArtistGallery] Group Artist1|Artist2: 
  ✓ Image1 (basename: s-XXX.png) -> 5
  ✓ Image2 (basename: s-YYY.png) -> 5
  ✓ Image3 (basename: s-ZZZ.png) -> 7
  ✓ Image4 (basename: s-WWW.png) -> 7

[ArtistGallery] calculateAverageRating - All ratings: {...}
Filtered values: [5, 5, 7, 7]
Sum: 24
Count: 4
Average: 6
```

---

## What Each Log Means

| Log | Meaning | What to Look For |
|-----|---------|------------------|
| `All image ratings from file:` | The ratings loaded from `.artist-ratings.json` | Should have 4 entries with values 5,5,7,7 |
| `Basename to rating map:` | Processed ratings with extracted basenames | Should have 4 entries |
| `✓ Image... -> 5` | Image successfully matched to rating | All 4 images should show checkmarks |
| `✗ Image... -> NOT FOUND` | Image NOT found in ratings | **If you see this, it's the problem!** |
| `Filtered values: [5, 5, 7, 7]` | The actual values being averaged | Should be `[5, 5, 7, 7]` |
| `Average: 6` | The calculated average | Should be 6 |

---

## Possible Issues & Solutions

### Problem 1: Images Not Found (✗ marks)

**Logs show:**
```
✗ Image "1girl, ... s-XXXXXXX.png" (basename: s-XXXXXXX.png) -> NOT FOUND
```

**Cause:** Image filename doesn't match the stored rating key

**Solution:** Check what's actually in the `.artist-ratings.json` file:
```bash
cat /path/to/.artist-ratings.json
```

Should show:
```json
{
  "s-XXXXXXX.png": 5,
  "s-YYYYYYY.png": 5,
  "s-ZZZZZZZ.png": 7,
  "s-WWWWWWW.png": 7
}
```

### Problem 2: Wrong Values in Ratings File

**Logs show:**
```
All image ratings from file: {
  "s-XXXXXXX.png": 7,
  "s-YYYYYYY.png": 7,
  ...
}
```

**But you set them to 5, 5, 7, 7**

**Cause:** 
- Ratings weren't saved correctly from modal
- Or they were overwritten
- Or the file wasn't properly merged

**Solution:** Check the console logs when you SET the ratings:
```
[Modal] setRating called with: 5
[Modal] After setRating:
  - currentImageRating: 5
  - Full imageRatings: { "s-XXX.png": 5 }
```

### Problem 3: Only Some Images Counted

**Logs show:**
```
Group Artist1: images=4, rated=2, average=7
Filtered values: [7, 7]
Average: 7
```

**Meaning:** Only 2 images have ratings, and they're both 7

**Cause:** The other 2 images don't have ratings in the file, OR their basenames don't match

**Solution:** 
1. Check if you actually saved the ratings for all 4 images
2. Check the `.artist-ratings.json` file to see which ratings exist

### Problem 4: Rounding Issue

**Logs show:**
```
Average: 6
```

**But display shows:** 7

**Cause:** Rounding happening in the template or display code

**Solution:** Check if there's any `Math.round()` or rounding in the template display

---

## How to Fix (Based on What You Find)

### If Issue is in the Ratings File

Make sure your `.artist-ratings.json` file has correct format:
```json
{
  "s-227156113.png": 5,
  "s-227156114.png": 5,
  "s-227156115.png": 7,
  "s-227156116.png": 7
}
```

NOT:
```json
{
  "1girl, {{...}} s-227156113.png": 5,  // ✗ Full filename with prompt
  ...
}
```

### If Issue is in Basename Extraction

The regex is: `/(s-\d+(?:\s+\(\d+\))?\.png)$/i`

This matches:
- ✓ `s-227156113.png`
- ✓ `s-227156113 (2).png`
- ✓ `1girl, {{...}} s-227156113.png` (extracts just the s-part)

If your filenames are different, we need to adjust the regex.

### If Issue is in Rating Not Being Saved

Check console during modal closing:
```
[ArtistGallery] Ratings from modal: { "s-XXX.png": 5, ... }
[ArtistGallery] Merged ratings: { ... }
```

Look at the response from server's save-ratings endpoint - check the `totalEntries` count.

---

## What to Send Me

Once you've reproduced the issue, please send me:

1. **Browser console logs** (full output from opening group to closing modal)
2. **The `.artist-ratings.json` file content** 
   ```bash
   cat /path/to/.artist-ratings.json
   ```
3. **The exact group and images** you're testing with
4. **Screenshot of the average rating shown**

This will help me identify exactly where the calculation is going wrong!

---

## Quick Test

1. Clear all ratings: Delete `.artist-ratings.json` file
2. Restart the app
3. Open a group with exactly 4 images
4. Rate them: 5, 5, 7, 7
5. **Collect ALL the console logs**
6. Close modal
7. **Collect the "Refreshing average ratings" logs**

Then share those logs and we can pinpoint the issue!
