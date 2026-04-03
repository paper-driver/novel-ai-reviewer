# Existing Implementation Documentation

## Overview

This document describes the current implementations of critical services: Artist Registry, Base Image Management, Combination Generator, and Image Analysis. **All implementations are file-based with no external database.**

---

## 1. Artist Registry Service

**File:** `server/services/artistRegistryService.js`  
**Pattern:** Service class managing artist CRUD and strength calculation

### Data Model

All artists stored in `.registry.json` with the following structure:

```javascript
{
  id: string,              // UUID v4
  name: string,            // Artist identifier
  artStyle: string,        // 'fine-art' | 'anime' | 'realistic' | 'abstract' | etc.
  strength: number,        // 0-1 calculated hybrid score
  strengthLabel: string,   // 'weak' | 'medium' | 'strong'
  confidence: number,      // 60-95% based on image pair count
  
  // Dimension scores (0-10 manual attributes)
  anatomy: number,
  object: number,
  colouring: number,
  promptInterpretation: number,
  
  // Validation metadata
  imagesCount: number,          // Number of base+with_artist pairs analyzed
  validationStatus: string,     // 'pending' | 'analyzing' | 'validated'
  lpipsScores: number[],        // Historical LPIPS scores for each pair
  googleVisionScores: number[], // Historical Vision API scores for each pair
  lastUpdated: string,          // ISO timestamp
  metadata: {
    addedBy: string,
    description: string,
    notes: string
  }
}
```

### File Structure

```
registryFolder/
├── .registry.json                    # Main registry file
│
├── genericBaseImages/                # Reusable base images (from baseImageManagerService)
│   ├── landscape1.jpg
│   ├── character2.png
│   └── ...
│
└── artistName1/
    ├── metadata.json                 # Image pairs for this artist
    ├── base/                         # Base images (input)
    │   ├── pair1_base.jpg
    │   └── pair2_base.jpg
    └── with_artist/                  # Generated/uploaded images (with artist applied)
        ├── pair1_with_artist.jpg
        └── pair2_with_artist.jpg
```

### Registry File Format

```json
{
  "version": "1.0",
  "lastUpdated": "2024-01-15T10:30:00Z",
  "folder": "full/path/to/registry",
  "artists": [
    { /* artist record */ }
  ]
}
```

### Metadata File Format

Each artist folder contains `metadata.json` tracking image pairs:

```json
{
  "pairs": [
    {
      "id": "uuid",
      "uploadedAt": "2024-01-15T10:30:00Z",
      "baseImage": "base/pair1.jpg",              // Path relative to artist folder
      "withArtistImage": "with_artist/pair1.jpg", // Path relative to artist folder
      "lpipsScore": 0.35,                         // Perceptual distance
      "googleVisionScore": 0.28,                  // Vision API difference
      "status": "validated"                       // 'pending' | 'analyzing' | 'validated'
    }
  ]
}
```

### Strength Calculation Algorithm

Called by: `updateArtistStrength(folderPath, artistId, lpipsScore, googleVisionScore)`

**Formula:**

```javascript
// Step 1: Normalize raw scores to 0-1 range
// (Practical max LPIPS: 0.5, max Vision: 0.4)
normalizedLPIPS = Math.min(lpipsScore / 0.5, 1.0)
normalizedVision = Math.min(googleVisionScore / 0.4, 1.0)

// Step 2: If multiple pairs exist, calculate averages
if (imageCount > 1) {
  avgNormalizedLPIPS = lpipsScores.map(s => Math.min(s / 0.5, 1.0)).average()
  avgNormalizedVision = googleVisionScores.map(s => Math.min(s / 0.4, 1.0)).average()
} else {
  avgNormalizedLPIPS = normalizedLPIPS
  avgNormalizedVision = normalizedVision
}

// Step 3: Calculate hybrid strength (LPIPS weighted 67%, Vision 33%)
strength = (avgNormalizedVision × 0.33) + (avgNormalizedLPIPS × 0.67)

// Step 4: Assign label based on ranges
if (strength ≤ 0.33)      → strengthLabel = 'weak'
else if (strength ≤ 0.66) → strengthLabel = 'medium'
else                       → strengthLabel = 'strong'

// Step 5: Calculate confidence based on image pairs
1 pair  → 60%
2 pairs → 70%
3 pairs → 80%
4 pairs → 90%
5+ pairs → 95%
formula: 60 + ((imageCount - 1) × 10)
```

### Confidence Meaning

- **60-70%**: Initial strength estimate (1-2 pairs)
- **80%**: Well-established (3 pairs)
- **90%**: Very confident (4 pairs)
- **95%**: Highly confident (5+ pairs)

### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `addArtist()` | Create new artist | Artist object |
| `updateArtist()` | Edit allowed fields | Updated artist |
| `deleteArtist()` | Remove artist + folder | void |
| `listArtists()` | Get all artists | Artist array |
| `updateArtistStrength()` | Recalculate strength from scores | Updated artist |
| `getAnalysisDetails()` | Full analysis data | Analysis object |
| `getImagePairsList()` | All pairs for artist | Pair array |
| `saveImagePairMetadata()` | Store pair info | void |

---

## 2. Base Image Manager Service

**File:** `server/services/baseImageManagerService.js`  
**Pattern:** Service class for generic (reusable) base images

### Purpose

- Separates base images from artist-specific storage
- Allows reusing a single base image across multiple artists
- Reduces duplication

### Storage Location

All base images stored in: `registryFolder/genericBaseImages/`

No artist-specific subfolders.

### File Structure

```
registryFolder/
└── genericBaseImages/
    ├── landscape_sunset.jpg
    ├── character_portrait.png
    ├── object_study.webp
    └── ...
```

### Validation Rules

**File Formats:** PNG, JPG, JPEG, WebP  
**Max Size:** 50MB  
**Security:** Path traversal prevention (no `..`, `/`, `\`)

### Metadata Extraction

Services attempts EXIF/metadata extraction for:
- Dimensions
- Color profile
- GPS data (if available)
- Creation date

### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `uploadBaseImage()` | Write image to folder | Success object |
| `listBaseImages()` | Get all available base images | Image info array |
| `deleteBaseImage()` | Remove image | Success object |
| `getBaseImagePath()` | Get full path to image | File path string |
| `isValidBaseImage()` | Validate format + size | Boolean |

### Return Structure

```javascript
{
  name: "landscape.jpg",
  path: "/full/path/to/file",
  size: 2048576,           // bytes
  created: Date,
  modified: Date,
  metadata: {
    width: 1920,
    height: 1080,
    colorSpace: "sRGB"
  }
}
```

---

## 3. Combination Generator Service

**File:** `server/services/combinationGeneratorService.js`  
**Pattern:** NLP-based generator with emphasis calculation for Novel AI

### Purpose

- Parse user natural language requests
- Match artists from registry based on style + attributes
- Generate 5 optimized artist combinations
- Calculate emphasis weights for Novel AI

### Input

```javascript
{
  registryArtists: Artist[],  // All artists from registry
  userInput: string,          // e.g., "anime realistic strong character anatomy"
  maxSuggestions: number      // Default: 5
}
```

### Output

```javascript
{
  success: boolean,
  input: string,
  parsed: {
    detectedStyles: [{ style, confidence }],
    detectedAttributes: { anatomy, objects, coloring, background, expression },
    styleIntensity: { intensity, confidence }
  },
  suggestions: [
    {
      artists: [
        {
          artist: Artist,
          role: string,      // 'primary' | 'secondary' | 'complementary' | 'accent' | 'balanced'
          emphasis: number   // 0.7-1.6 Novel AI weight
        }
      ],
      rankScore: number,     // 0-1 quality score
      confidence: string,    // "75%" confidence in suggestion
      explanation: string,   // Human-readable reasoning
      promptFormat: string   // For Novel AI: "1.3::artist:Name1::, 0.9::artist:Name2::"
    }
  ],
  matchedArtists: number,
  timestamp: string
}
```

### Four Generation Strategies

Applied in sequence to fill 5 suggestion slots:

#### **Strategy 1: Primary + Complementary**
- Top matched artist as primary (emphasis: 1.3)
- Find 5 complementary artists
- Complementary scoring:
  - Different art style: +0.3
  - Strong at weak artist's attribute: +0.2 per attribute
  - Overall strength > 0.7: +0.1

#### **Strategy 2: Equally-Weighted**
- Top 6 matched artists
- All role = 'balanced' (emphasis: 1.0)
- No hierarchy

#### **Strategy 3: Attribute-Focused**
- Per attribute requested (anatomy, objects, coloring):
  - Pair strongest artist with weakest artist
  - Optimize for attribute improvement

#### **Strategy 4: Subset Combinations**
- Various combinations of 2-5 artists
- Different starting positions in matched artists
- Fills remaining suggestion slots

### Matching Algorithm

```javascript
matchScore = 0

// Art style matching (0-0.5 points)
if (artist.artStyle matches parsed.detectedStyles) {
  matchScore += confidence × 0.5
}

// Attribute matching (0-0.5 points)
attributeMatches = count of:
  - anatomy ≥ 5
  - object ≥ 5
  - colouring ≥ 5
  - promptInterpretation ≥ 5

matchScore += (attributeMatches / totalRequestedAttributes) × 0.5

// Strength bonus (10% boost)
if (artist.strength > 0.7) {
  matchScore *= 1.1
}

matchScore = Math.min(matchScore, 1.0)  // Cap at 1.0
```

### Emphasis Calculation

**Flow:**

```javascript
// 1. Base preference by role
basePreference = {
  'primary': 1.3,
  'secondary': 0.9,
  'complementary': 0.85,
  'accent': 0.8,
  'balanced': 1.0
}[role]

// 2. Intensity multiplier from parsed input
intensityBonus = {
  'weak': 0.85,
  'medium': 1.0,
  'strong': 1.15,
  'very-strong': 1.25
}[parsed.styleIntensity]

// 3. Attribute bonus (if user requested specific attributes)
if (requestedAttributes.length > 0) {
  matchedAttrScore = avg(artist.anatomy, artist.object, 
                         artist.colouring, artist.promptInterpretation) / 10
  attributeBonus = 0.9 + (matchedAttrScore × 0.3)  // 0.9-1.2 range
} else {
  attributeBonus = 1.0
}

// 4. Strength-based adjustment
strengthAdjustment = {
  'weak': 1.2,       // Boost weak artists
  'medium': 1.0,     // Neutral
  'strong': 0.9      // Reduce dominance
}[artist.strengthLabel]

// 5. Final calculation
emphasis = basePreference × intensityBonus × attributeBonus × strengthAdjustment

// 6. Clamp to Novel AI safe range
emphasis = Math.max(0.7, Math.min(1.6, emphasis))
```

### Emphasis Normalization

When combining artists, ensures no single artist dominates:

```javascript
// Identify min/max emphasis in combination
min = Math.min(...artists.map(a => a.emphasis))
max = Math.max(...artists.map(a => a.emphasis))
range = max - min

// If range is small (< 0.1), no adjustment needed

// Otherwise, redistribute to 0.8-1.3 range
normalized = 0.8 + ((emphasis - min) / range) × 0.5
```

### Ranking Algorithm

```javascript
rankScore = 0

// Variety bonus (more artists = better)
rankScore += Math.min(combo.artists.length × 0.1, 0.3)

// Match quality (40% of score)
avgMatchScore = avg(artist.matchScore for each artist)
rankScore += avgMatchScore × 0.4

// Artist strength (20% of score)
avgStrength = avg(artist.strength for each artist)
rankScore += avgStrength × 0.2

// Role diversity bonus (10%)
hasVariedRoles = (unique roles count > 1)
if (hasVariedRoles) rankScore += 0.1

rankScore = Math.min(rankScore, 1.0)
confidence = round((0.7 + rankScore × 0.3) × 100) + '%'
```

### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `generateCombinations()` | Main entry point | Output object |
| `findMatchingArtists()` | NLP match artists | Artist array |
| `generateCombinationSuggestions()` | Create 5 suggestions | Combination array |
| `findComplementaryArtists()` | Score complements | Artist array |
| `calculateEmphasis()` | Compute weight | Number 0.7-1.6 |
| `normalizeEmphasis()` | Prevent dominance | Artist array |
| `rankCombinations()` | Final scoring | Ranked array |
| `formatPrompt()` | Novel AI format | String |

---

## 4. Image Analysis Service

**File:** `server/services/imageAnalysisService.js`  
**Pattern:** Orchestration service coordinating LPIPS + Vision API

### Purpose

Parallel analysis of two images using:
- **LPIPS** (Learned Perceptual Image Patch Similarity) - Perceptual difference
- **Google Vision API** - Content analysis

### Analysis Types

#### LPIPS - Perceptual Distance
- Measures visual similarity between images
- Ranges: 0 (identical) to ~0.5+ (very different)
- Used to detect style/quality differences
- Practical max in app: 0.5

#### Google Vision API - Content Analysis
- Labels: Objects detected
- Properties: Colors, faces, text
- Web Detection: Related images
- Ranges: 0 (no match) to ~0.4+ (high difference)
- Practical max in app: 0.4

### Hybrid Score Calculation

```javascript
// Step 1: Normalize scores to 0-1
normalizedLPIPS = Math.min(lpipsScore / 0.5, 1.0)     // 0.5 is practical max
normalizedVision = Math.min(googleVisionScore / 0.4, 1.0)  // 0.4 is practical max

// Step 2: Weighted hybrid (LPIPS 67%, Vision 33%)
hybridScore = (normalizedVision × 0.33) + (normalizedLPIPS × 0.67)

// Result: 0-1 scale where 1.0 = maximum difference
```

### Analysis Result Structure

```javascript
{
  lpipsScore: number,           // 0-0.5+ raw score
  googleVisionScore: number,    // 0-0.4+ raw score
  hybridScore: number,          // 0-1 normalized
  timestamp: string,            // ISO date
  artistName: string            // For reference
}
```

### Caching Strategy

- **Key:** `imagePath_A:imagePath_B`
- **Storage:** In-memory JavaScript Map
- **Methods:** `getCachedAnalysis()`, `cacheAnalysisResult()`, `clearCache()`, `getCacheSize()`
- **Persistence:** Not persisted to disk (runtime only)

### Parallel Execution

```javascript
// Both analyses run in parallel via Promise.all
const [lpipsScore, googleVisionScore] = await Promise.all([
  this.computeLPIPS(imageA, imageB),
  this.analyzeWithGoogleVision(imageA, imageB)
])
```

### Key Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `analyzeImagePair()` | Main entry point | Result object |
| `computeLPIPS()` | Wrapper for LPIPS | Score 0-1 |
| `analyzeWithGoogleVision()` | Wrapper for Vision API | Score 0-1 |
| `calculateHybridScore()` | Combine scores | Score 0-1 |
| `getCachedAnalysis()` | Cache lookup | Result or null |
| `cacheAnalysisResult()` | Store result | void |
| `clearCache()` | Reset cache | void |
| `getCacheSize()` | Cache size | Number |
| `shutdown()` | Cleanup | Promise |

---

## Data Flow Integration

### Workflow 1: Manual Upload (Base + With Artist)

```
User uploads base_image + with_artist_image
            ↓
imageAnalysisService.analyzeImagePair(base, with_artist)
            ↓
        [Parallel]
  ├─ LPIPS score
  └─ Vision API score
            ↓
artistRegistryService.updateArtistStrength(lpips, vision)
            ↓
[Normalize scores, calculate hybrid, update strength/label]
            ↓
Artist record updated with:
  - New score in lpipsScores[]
  - New score in googleVisionScores[]
  - Updated strength (0-1)
  - Updated strengthLabel (weak|medium|strong)
  - Updated confidence (60-95%)
  - Updated imagesCount
```

### Workflow 2: Generation (Base Images → Generate with Artist)

```
User selects base_images + artist
            ↓
Backend generates image with artist via Novel AI
  (using emphasis weight from combination generator)
            ↓
imageAnalysisService.analyzeImagePair(base, generated)
            ↓
        [Parallel]
  ├─ LPIPS score
  └─ Vision API score
            ↓
artistRegistryService.updateArtistStrength(lpips, vision)
            ↓
[Same strength update logic as Workflow 1]
```

### Artist Combination Generation Flow

```
User request: "anime realistic strong character"
            ↓
combinationGeneratorService.generateCombinations(
  registryArtists,
  userInput
)
            ↓
[Parse user input with NLP]
            ↓
[Find 20+ matched artists]
            ↓
[Apply 4 strategies → 5 suggestions]
            ↓
[Rank and return top 5]
            ↓
Each suggestion includes:
  - Artist names
  - Role (primary/secondary/complementary/accent/balanced)
  - Emphasis (0.7-1.6 Novel AI weight)
  - Explanation
  - Prompt format: "1.3::artist:Name1::, 0.9::artist:Name2::"
```

---

## Important Design Constraints

### Registration & Strength

1. **Initial Status:** New artists created with `validationStatus = 'pending'`
2. **First Pair Updates Status:** Status changes to 'validated' after first `updateArtistStrength()`
3. **Strength Improves with Pairs:** More pairs = higher confidence (60-95%)
4. **Strength Recalculation:** Always averages all stored scores

### Combination Generation

1. **Max 5 Suggestions:** Hard limit (configurable in call)
2. **Strict Style Matching:** User art style must exactly match artist's artStyle
3. **Attribute Threshold:** Artists only matched if at least one attribute ≥ 5
4. **Top Artists Only:** Only top-matched artists considered for combinations
5. **Emphasis Safety:** Clamped to 0.7-1.6 to prevent Novel AI issues

### Analysis

1. **Parallel Execution:** LPIPS and Vision always run together
2. **Normalization:** Both scores normalized to 0-1 before hybrid calculation
3. **LPIPS Practical Max:** 0.5 (higher = more different)
4. **Vision Practical Max:** 0.4 (higher = more different)
5. **Weighting:** 67% LPIPS, 33% Vision (for artist strength)

### Base Images

1. **Reusable:** Same base image can be used with any artist
2. **Separate Storage:** Never stored in artist folders
3. **File-Based:** No database uniqueness constraints
4. **Security:** Path traversal attacks prevented

---

## Future Extension Points

### For Quality Analysis Feature

These services will require extensions:

1. **artistRegistryService:**
   - New field in artist record: `qualityAnalysis: object` (parallel to lpipsScores/googleVisionScores)
   - New confidence formula: Combined calc from (LPIPS×0.4) + (Quality×0.6)
   - New data structure for 6 metrics: anatomy, objectDetection, objectQuality, coloring, detailDrawing, promptInterpretation

2. **imageAnalysisService:**
   - New method: `analyzeQuality(imagePath)` - Single image quality scores
   - Integration point for MediaPipe, YOLO, CLIP models
   - Cache extension for quality results

3. **artistRegistryService.updateArtistStrength() changes:**
   - Accept optional `qualityAnalysis` parameter
   - Recalculate final score: (LPIPS×0.4) + (Quality×0.6) instead of (LPIPS×0.67) + (Vision×0.33)
   - Store quality analysis in artists record

---

## File References Summary

| Service | File | Key Class | Config |
|---------|------|-----------|--------|
| Artist Registry | `server/services/artistRegistryService.js` | `ArtistRegistryService` | None |
| Base Images | `server/services/baseImageManagerService.js` | `BaseImageManagerService` | `GENERIC_BASE_IMAGES_FOLDER = 'genericBaseImages'` |
| Combinations | `server/services/combinationGeneratorService.js` | `CombinationGeneratorService` | `maxSuggestions = 5`, `emphasisRange = 0.7-1.6` |
| Analysis | `server/services/imageAnalysisService.js` | `ImageAnalysisService` | `lpipsMax = 0.5`, `visionMax = 0.4` |

All services use file-based storage with no external database.
