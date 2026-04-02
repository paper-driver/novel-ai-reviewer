# Image Analysis Pipeline Walkthrough

## Current Implementation Status

### ✅ What IS Being Done (Currently)

**1. Vision API Analysis (Google Cloud Vision)**
- Runs on the **generated image only** (with_artist)
- Analyzes: labels, objects, safe search detection, image properties, web detection
- Returns a single score (0-10) based on label confidence
- Example: `7/10` quality score

**Process:**
```
Base Image → [Skip Vision API] 
Generated Image (with_artist) → Vision API → Score: 7/10
```

**Current Code Location:** `server/routes/imageGenerationRoutes.js` lines 302-315
```javascript
analysisResult = await visionAnalysisService.analyzeImageQuality(savedPath);
logger.info(TAG, `Vision analysis completed for: ${savedPath}. Score: ${analysisResult}/10`);

job.generatedImages.push({
  filename: path.basename(savedPath),
  path: savedPath,
  baseImage: baseImageName,
  analysisResult: analysisResult  // Just the number: 7
});
```

### ❌ What's MISSING (Not Currently Done)

**1. LPIPS (Learned Perceptual Image Patch Similarity) Analysis**
- **Purpose:** Measure perceptual similarity between base image and generated image
- **Range:** 0 (identical) to 1+ (very different)
- **Service Exists But Not Used:** `server/services/lpipsService.js`
- **Python Implementation:** `server/ml/lpips_analyzer.py`

**Missing Process:**
```
Base Image ──┐
             ├→ LPIPS Computation → Similarity Score: 0.3
Generated Image ──┘
```

**2. Comparative Vision Analysis**
- Currently: Only generated image is analyzed
- Should also: Analyze base image separately
- Benefit: Compare perception differences before/after artist application

**Ideal Process:**
```
Base Image ──→ Vision API → Score: 8/10, Labels: [person, illustration, anime...]
              ↓
              LPIPS Comparison (0.35)
              ↑
Generated Image ──→ Vision API → Score: 7/10, Labels: [person, illustration, anime, artistic_style...]
```

---

## How Image Analysis SHOULD Work

### Step 1: Prepare Images
```
For each base image:
  ✅ Copy to artist folder: /ArtistName/base/
  ✅ Generate with Novel AI: /ArtistName/with_artist/
```

### Step 2: Vision Analysis (Currently Done)
```
Generated Image ──→ Google Vision API ──→ {
  labels: [{ description, confidence }, ...],
  safe_search: {...},
  image_properties: {...}
} ──→ Convert to Score (0-10)
```

### Step 3: LPIPS Analysis (NOT CURRENTLY DONE)
```
Base Image + Generated Image ──→ Python LPIPS ──→ Similarity Score (0-1)
```

### Step 4: Store Results (Partially Done)
```
Currently saved:
{
  filename: "image_123.png",
  path: "/ArtistName/with_artist/image_123.png",
  baseImage: "base_image.png",
  analysisResult: 7,  // Vision score only
  generatedAt: "2026-04-02T..."
}

Should save:
{
  filename: "image_123.png",
  path: "/ArtistName/with_artist/image_123.png",
  baseImage: "base_image.png",
  visionAnalysis: {
    generated: 7,  // Score for generated image
    base: 8,       // Score for base image (NEW)
  },
  lpipsScore: 0.35,  // Perceptual similarity (NEW)
  lpipsInterpretation: "Good match - generated captures base characteristics",
  generatedAt: "2026-04-02T..."
}
```

---

## Why You Don't See Results in the Table

**Root Causes:**

1. **LPIPS Not Computed** → Missing data for display
   - Need to add LPIPS service call in image generation
   
2. **Only Single Vision Score** → Can't compare before/after
   - Need to also analyze base image
   
3. **Frontend Doesn't Know Structure** → Table doesn't display partial data
   - Needs UI columns for: Base Vision Score, Generated Vision Score, LPIPS
   
4. **Results Returned But Not Integrated** → Analysis happens, but not shown
   - Need to map analysis results to artist record fields
   - Need to update artist registry with scores

---

## Files Involved

| File | Role | Status |
|------|------|--------|
| `server/services/visionAnalysisService.js` | Vision API ✅ Built | Active ✅ |
| `server/services/lpipsService.js` | LPIPS wrapper ⚠️ Built but unused | Inactive ❌ |
| `server/ml/lpips_analyzer.py` | LPIPS calculator | Not called |
| `server/routes/imageGenerationRoutes.js` | Orchestrates generation | Partial |
| `src/app/components/artist-registry/...` | UI display | Needs structure |

---

## Data Flow Issues

### Current (Broken):
```
Image Generation
  ├─ Generate image ✅
  ├─ Analyze with Vision API ✅
  │  └─ Store as: analysisResult: 7 (just a number)
  └─ (MISSING) LPIPS comparison ❌

Results Endpoint
  ├─ Returns generatedImages array ✅
  │  └─ Each has analysisResult: 7
  └─ Calculates strength as average ✅

Frontend
  ├─ Receives results ✅
  ├─ Can't display because:
     ├─ No lpipsScore field
     ├─ No base image analysis
     ├─ Table not designed for new fields
  └─ Shows "N/A" for missing data
```

### What Needs to Happen:
```
Image Generation
  ├─ Analyze base image with Vision ← ADD
  ├─ Generate image ✅
  ├─ Analyze generated with Vision ✅
  ├─ Compute LPIPS between base & generated ← ADD
  └─ Store comprehensive results

Results Endpoint
  ├─ Return full analysis objects ← CHANGE
  └─ Include lpipsScore, baseVisionScore, generatedVisionScore

Frontend
  ├─ Update table columns ← CHANGE
  ├─ Display Vision scores (base vs generated)
  ├─ Display LPIPS similarity
  └─ Show comparison interpretation
```

---

## Next Steps

To see analysis results, we need to:

1. **Call Vision API on base image** (before generation)
2. **Call LPIPS service** to compare base vs generated
3. **Store structured results** with all scores
4. **Update frontend** to display the new fields
5. **Add interpretation logic** (e.g., "Low LPIPS (0.2) = Artist changed style significantly")

Would you like me to implement these missing pieces?
