# Artist Registry Instructions

## Overall Goal:
Artist Registry is a dictionary for users to refer and understand the effect of artist tag on Novel AI image generation. Some artist tags have a strong influence on the generated image, while some have a weak influence. By categorizing artist tags based on their strength, users can make informed decisions when selecting tags for their image generation.

## Core Features:
### 1. Artist Tag Management
- User can view a list of artist tags in the registry, along with their measured strength and other attributes
- User can add new artist tags to the registry with initial attributes (anatomy, object, coloring, prompt interpretation, art style)
- User can edit existing artist tags in the registry, updating their manual attributes only (strength is auto-calculated)
- User can delete artist tags from the registry

### 2. Artist Tag Strength Measurement (Hybrid LPIPS Approach)
This is the **new critical feature** for automatically measuring artist influence on image generation.

#### Workflow Overview:
```
User Uploads Image Pair
    ↓
Google Vision API Analysis (automated)
    ↓
LPIPS Analysis (automated)
    ↓
Hybrid Score Calculation [GV×0.33 + LPIPS×0.67]
    ↓
Strength Category Assignment (Weak: 0-0.33, Medium: 0.34-0.66, Strong: 0.67-1.0)
    ↓
Registry Updated with Strength Value
```

### 3. Data Storage Structure
- Local folder stores images organized by artist tag sub-folder structure
  - Root folder: User-selected directory
  - Sub-folders: Named after artist tags (e.g., `greg_rutkowski/`, `wlop/`, `claude_monet/`)
  - Image pair organization:
    - `artist_name/base/`: Image without artist tag (baseline/control)
    - `artist_name/with_artist/`: Image with artist tag (experimental)
    - `artist_name/metadata.json`: Pair metadata, LPIPS score, user rating, calculated strength

- `.registry.json` at root: Master registry file containing all artist metadata
  - Updated whenever artists are added, edited, deleted, or strength is recalculated
  - Contains cached LPIPS scores to avoid re-analysis


## Registry Table Columns:
- **Artist Tag Name**: The name of the artist tag as it would be used in Novel AI prompts
- **Default Strength (auto-calculated)**: Decimal value (0-1) determined by hybrid LPIPS + Google Vision API + user validation approach
  - **NOT editable by user** - calculated automatically
  - Derived from weighted combination (fully automated, no manual input):
    - Google Vision API (33%): Detects style/aesthetic changes in objects and features
    - LPIPS (67%): Measures perceptual similarity from human perspective
  - Interpretation scale:
    - **Weak (0.00-0.33)**: Artist tag has subtle influence on generation
    - **Medium (0.34-0.66)**: Artist tag has moderate influence on generation
    - **Strong (0.67-1.00)**: Artist tag has significant influence on generation
- **Confidence** (%): Reliability score based on number of image pairs analyzed
  - 1 pair: 60% confidence
  - 3 pairs: 80% confidence
  - 5+ pairs: 95% confidence
  - Higher confidence = more reliable strength value
- **Anatomy** (0-10): User-rated quality of artist's anatomical accuracy. User input only.
- **Object** (0-10): User-rated quality of artist's object rendering ability. User input only.
- **Colouring** (0-10): User-rated quality of artist's color usage and blending. User input only.
- **Prompt Interpretation** (0-10): User-rated quality of artist's ability to interpret and execute prompts. User input only.
- **Art Style**: Categorized into: Fine Art, Semi-Realistic, Realistic, Anime, Cartoon, Manga, ACG, Wuxia
  - Fine Art: Focus on traditional techniques, realism, and detail
  - Semi-Realistic: Blend of realistic and stylized elements with character focus
  - Realistic: High detail and accuracy, lifelike representations
  - Anime: Exaggerated features, vibrant colors, dynamic action
  - Cartoon: Simplified shapes, bold lines, humor and exaggeration
  - Manga: Line art focus, bold contrasts, dynamic storytelling
  - ACG: Blend of Anime, Cartoon, and Manga styles
  - Wuxia: Martial arts and fantasy elements with traditional Chinese art influence
- **Images Uploaded** (count): Number of image pairs analyzed for this artist tag
  - Each image pair = 1 baseline + 1 with-artist version
  - Used as confidence indicator (more images = more reliable strength measurement)
- **Last Updated** (timestamp): When this artist's strength was last measured/updated
- **Last Updated** (timestamp): When this artist's strength was last measured/updated
- **Validation Status**: 
  - `pending` = Image pair uploaded, awaiting analysis
  - `analyzing` = Google Vision + LPIPS analysis in progress
  - `validated` = Analysis complete, strength calculated and stored
  - Used to track processing state

## File Structure (.registry.json Format):
```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-01T12:30:00Z",
  "folder": "/Users/leonmao/Pictures/ArtistRegistry",
  "artists": [
    {
      "id": "artist_001",
      "name": "greg_rutkowski",
      "artStyle": "semi-realistic",
      "strength": 0.78,
      "strengthLabel": "strong",
      "confidence": 95,
      "anatomy": 9,
      "object": 8,
      "colouring": 7,
      "promptInterpretation": 9,
      "imagesCount": 5,
      "validationStatus": "validated",
      "lpipsScores": [0.42, 0.38, 0.45, 0.40, 0.39],
      "googleVisionScores": [0.35, 0.32, 0.38, 0.33, 0.31],
      "lastUpdated": "2026-03-28T10:15:00Z",
      "metadata": {
        "addedBy": "user",
        "description": "Digital artist known for fantasy art",
        "notes": "Consistent strong style across generations"
      }
    }
  ]
}
```

## LPIPS Strength Measurement Implementation Details:

### Step 1: Image Upload Interface
- User uploads image pair for artist tag:
  - **Image A** (baseline): Generated WITHOUT artist tag
    - Same prompt, same seed/settings as Image B
    - Example: `"1girl, black hair, detailed, high quality"`
  - **Image B** (with artist): Generated WITH artist tag
    - Same prompt + artist tag, same seed/settings as Image A
    - Example: `"1girl, black hair, detailed, high quality, greg_rutkowski"`
- Store both images in subdirectory with metadata file

### Step 2: Google Vision API + LPIPS Analysis (Automated)
This step combines two complementary approaches:

**Google Vision API Analysis**:
- Analyze both Image A and Image B
- Extract features: objects, labels, colors, estimated style, detail level
- Compare feature differences between images
- Score represents change in detected features/style (0-1 scale)
- Good at detecting: object changes, style shifts, color distribution changes

**LPIPS Analysis**:
- Load pre-trained LPIPS model (available via torch: `lpips.LPIPS(net='alex')` or `lpips.LPIPS(net='vgg')`)
- Compute perceptual distance between Image A and Image B
- Output score: 0.0 (identical) to ~1.0 (completely different)
- Good at detecting: subtle visual differences, perceptual similarity

**Processing Considerations**:
- Run both analyses in parallel for efficiency
- Google Vision API calls run asynchronously
- LPIPS runs on backend (CPU or GPU)
- Cache all results to avoid re-computation
- Handle batch processing if user uploads multiple image pairs
- Store both Google Vision and LPIPS scores with timestamps

### Step 3: Registry Update (Automatic)
- After analysis completes, automatically update `.registry.json` with:
  - Calculated strength value (from hybrid formula)
  - Google Vision API score
  - LPIPS score
  - Confidence percentage based on number of samples
  - Validation status → `validated`
  - Timestamp
- Show processing complete notification to user
- Artist appears in registry immediately with calculated strength
- Display both component scores for transparency
```
Google Vision API Analysis:
  - Detect objects, styles, colors in both images
  - Extract feature descriptors: [color_saturation, detail_level, style_markers]
  - Compute Google Vision difference score (0-1)

LPIPS Analysis:
  - Compute perceptual distance between images
  - Output score: 0.0 (identical) to ~1.0 (completely different)

Normalization & Hybrid Calculation:
  normalized_google_vision = GOOGLE_VISION_SCORE / MAX_GV_DISTANCE (use 0.4 as practical max)
  normalized_LPIPS = LPIPS_score / MAX_LPIPS_DISTANCE (use 0.5 as practical max)

  final_strength = (normalized_google_vision * 0.33) + (normalized_LPIPS * 0.67)
  
  Components:
  - Google Vision: 33% (detects style/aesthetic changes)
  - LPIPS: 67% (perceptual similarity from human perspective, primary metric)

strength_category = {
  0.00-0.33: "weak",
  0.34-0.66: "medium", 
  0.67-1.00: "strong"
}

Confidence Score:
  - Increases with number of image pairs analyzed for same artist
  - 1 pair: 60% confidence
  - 3 pairs: 80% confidence
  - 5+ pairs: 95% confidence
```

### Step 4: Multiple Image Pairs for Confidence
- For greater accuracy, users can upload multiple image pairs (3-5 recommended)
- Each pair is analyzed independently with full Google Vision + LPIPS pipeline
- Final strength calculated as **average** of all pairs
- Confidence score increases proportionally
- This approach provides robust, data-driven strength values

## User Workflows:

### Workflow 1: Add New Artist with Automated Strength Measurement
1. Click "Add Artist" button
2. Enter artist tag name and art style
3. Fill in subjective attributes (anatomy, object, coloring, prompt interpretation)
4. Upload first image pair (baseline + with artist)
5. System automatically runs Google Vision + LPIPS analysis in background
6. Strength auto-calculated and stored (show progress)
7. Artist appears in registry with calculated strength
8. Can upload more image pairs later to refine average strength and increase confidence

### Workflow 2: Refine Artist Strength with Additional Image Pairs
1. Select artist from registry
2. Click "Add Image Pair" or "Refine Measurement"
3. Upload new image pair for same artist
4. Automated analysis runs (Google Vision + LPIPS)
5. System recalculates strength as average of all image pairs
6. Confidence percentage increases
7. Strength value may update if new data is significantly different

### Workflow 3: View Strength Analysis Details
1. Click on artist row to expand details
2. See all image pairs analyzed with individual scores
3. View individual Google Vision and LPIPS scores per pair
4. Understand strength calculation and confidence level
5. Option to remove outlier image pairs if they seem incorrect (e.g. bad prompt matching)

## Technical Dependencies:
- **LPIPS Library**: PyTorch-based (https://github.com/richzhang/PerceptualSimilarity)
  - Can be run on CPU or GPU
  - Requires 2-3GB RAM per image pair analysis
  - Processing time: ~1-2 seconds per pair on modern hardware
- **Backend Service**: Node.js service to orchestrate analysis
- **Image Storage**: Local filesystem with folder structure
- **Registry Persistence**: JSON file in root of user-selected folder

