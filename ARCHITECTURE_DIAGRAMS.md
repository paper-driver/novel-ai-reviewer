# System Architecture & Workflow Diagrams

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER (You)                                  │
│                                                                     │
│  Opens browser → http://localhost:3000 → Selects images           │
└────────────────────────┬────────────────────────────────────────────┘
                         │
        ┌────────────────▼───────────────┐
        │                                │
        │     ANGULAR FRONTEND           │
        │  (Browser Application)         │
        │                                │
        │  ┌────────────────────────┐   │
        │  │  Image Modal Component │   │
        │  │ • Image Viewer         │   │
        │  │ • Metadata Sidebar     │   │
        │  │ • Rating Stars         │   │
        │  │ • AI Analysis Buttons  │◄──┼─── NEW!
        │  │ • Results Display      │   │
        │  └────────────────────────┘   │
        │                                │
        │  ┌────────────────────────┐   │
        │  │  Angular Services      │   │
        │  │ • IllustrationQuality  │   │
        │  │ • BatchRating          │   │
        │  │ • Review               │   │
        │  └────────────────────────┘   │
        └────────────────────┬───────────┘
                             │ HTTP Calls
        ┌────────────────────▼───────────────────────┐
        │                                            │
        │      NODE.JS EXPRESS BACKEND               │
        │    (Running on port 3000)                  │
        │                                            │
        │  ┌──────────────────────────────────────┐ │
        │  │  API ENDPOINTS                       │ │
        │  │  • /api/analyze-illustration         │ │
        │  │  • /api/batch-analyze-illustrations  │ │
        │  │  • /api/batch-rating/submit          │ │
        │  │  • /api/batch-rating/status/:jobId   │ │
        │  │  • /api/ratings/save                 │ │
        │  │  • /api/ratings/load                 │ │◄── NEW!
        │  └──────────────────────────────────────┘ │
        │                                            │
        │  ┌──────────────────────────────────────┐ │
        │  │  PROCESSING LOGIC                    │ │
        │  │  • analyzeImageQualityLocal()        │ │
        │  │  • processBatchJob()                 │ │
        │  │  • detectIssues()                    │ │
        │  │  • detectStrengths()                 │ │
        │  └──────────────────────────────────────┘ │
        │                                            │
        │  ┌──────────────────────────────────────┐ │
        │  │  FILE SYSTEM                         │ │
        │  │  • .image-ratings.json               │ │
        │  │  • User image folders                │ │
        │  └──────────────────────────────────────┘ │
        │                                            │
        └────────────────────┬──────────────────────┘
                             │ HTTPS Request
                             │ (Image Base64 + Features)
        ┌────────────────────▼──────────────────────────────┐
        │                                                   │
        │   GOOGLE CLOUD VISION API                         │
        │   (Machine Learning Service)                      │
        │                                                   │
        │  ┌─────────────────────────────────────────────┐ │
        │  │  Vision AI Features                         │ │
        │  │  • LABEL_DETECTION (20 labels)             │ │
        │  │  • OBJECT_LOCALIZATION (20 objects)        │ │
        │  │  • SAFE_SEARCH_DETECTION                   │ │
        │  │  • IMAGE_PROPERTIES (colors)               │ │
        │  │  • WEB_DETECTION (reverse image search)    │ │
        │  └─────────────────────────────────────────────┘ │
        │                                                   │
        │  Returns: Labels, objects, colors,               │
        │           safety scores, confidence              │
        │                                                   │
        └────────────────────┬──────────────────────────────┘
                             │ Response (JSON)
                             │ (Labels + Scores)
        ┌────────────────────▼──────────────────────────────┐
        │                                                   │
        │   SCORING ALGORITHM (Backend)                     │
        │                                                   │
        │   Input: Vision API labels & properties          │
        │                                                   │
        │   Process:                                        │
        │   1. Extract labels (anatomy, pose, face, etc.)  │
        │   2. Calculate component scores (1-10)           │
        │   3. Detect strengths & issues                   │
        │   4. Generate recommendations                    │
        │   5. Calculate weighted overall score            │
        │                                                   │
        │   Output: IllustrationQualityScore object        │
        │                                                   │
        └────────────────────┬──────────────────────────────┘
                             │
        ┌────────────────────▼──────────────────────────────┐
        │                                                   │
        │   STORAGE & SYNC                                  │
        │                                                   │
        │   Save to: .image-ratings.json                   │
        │   Format: { "image.jpg": 7, "image2.jpg": 8 }   │
        │                                                   │
        │   Sync to:                                        │
        │   • Artist Gallery (shows ratings)               │
        │   • Prompt Grouping (shows ratings)              │
        │   • Image Modal (displays results)               │
        │                                                   │
        └────────────────────┬──────────────────────────────┘
                             │
        ┌────────────────────▼──────────────────────────────┐
        │                                                   │
        │   DISPLAY RESULTS (Frontend)                      │
        │                                                   │
        │   Show to User:                                   │
        │   • 7 individual scores (1-10 each)              │
        │   • Overall score (weighted average)             │
        │   • Detected strengths (with ✓)                  │
        │   • Detected issues (with ⚠)                     │
        │   • Smart recommendations (with 💡)              │
        │   • Confidence percentage                        │
        │   • Processing time & cost                       │
        │                                                   │
        └────────────────────┬──────────────────────────────┘
                             │
        ┌────────────────────▼──────────────────────────────┐
        │                                                   │
        │   USER DECISION                                   │
        │                                                   │
        │   Based on results:                              │
        │   • Accept rating (save to .image-ratings.json)  │
        │   • Request re-analysis                          │
        │   • Adjust parameters                            │
        │   • Compare with other images                    │
        │   • Export results                               │
        │                                                   │
        └───────────────────────────────────────────────────┘
```

---

## 2. Data Flow Diagram

```
┌─────────┐
│  START  │
└────┬────┘
     │
     ▼
┌─────────────────────────────────┐
│ User clicks "🎨 Analyze Art"     │
│ or "🚀 Analyze All"              │
└────┬────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Frontend Component Method Called     │
│ autoRateCurrentIllustration()        │
│ OR                                   │
│ autoRateAllIllustrationsWithAI()    │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Set isAutoRating = true              │
│ Show "⏳ Analyzing..."               │
│ Disable buttons                      │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Read image file from disk            │
│ Encode to Base64                     │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Call Backend API                     │
│ POST /api/analyze-illustration       │
│ Body: { filePath: "..." }            │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Backend receives request             │
│ Validates file exists                │
│ Reads image into buffer              │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Create Vision API request            │
│ Include: Base64 image                │
│ Features:                            │
│  • LABEL_DETECTION                   │
│  • OBJECT_LOCALIZATION               │
│  • SAFE_SEARCH_DETECTION             │
│  • IMAGE_PROPERTIES                  │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Send HTTPS request to Google Cloud   │
│ Wait for response (~0.9 seconds)     │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Google Vision API processes image    │
│ Uses ML models to:                   │
│ • Identify 20 labels                 │
│ • Locate 20 objects                  │
│ • Detect explicit/violent/racy       │
│ • Extract dominant colors            │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Backend receives Vision API response │
│ Extract:                             │
│ • labels[]                           │
│ • localizedObjects[]                 │
│ • safeSearch{}                       │
│ • imageProperties{}                  │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ SCORING ALGORITHM                    │
│                                      │
│ 1. Extract label names               │
│ 2. Initialize scores = 6/10          │
│ 3. For each label:                   │
│    • If matches anatomy → +2         │
│    • If matches pose → +2            │
│    • If matches face → +2            │
│    • If matches background → +2      │
│    • If matches clothing → +2        │
│ 4. Check safety scores               │
│    • Adult content → -3              │
│    • Violence → -2                   │
│ 5. Clamp scores to 1-10              │
│ 6. Calculate weighted overall        │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ ANALYSIS GENERATION                  │
│                                      │
│ 1. Detect Strengths:                 │
│    • "Clear facial features"         │
│    • "Good pose/gesture"             │
│ 2. Detect Issues:                    │
│    • "Low background detail"         │
│ 3. Generate Recommendations:         │
│    • "Enhance background"            │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Create Response Object               │
│ {                                    │
│   overallScore: 7,                   │
│   anatomyScore: 7,                   │
│   poseScore: 6,                      │
│   faceQuality: 8,                    │
│   backgroundQuality: 6,              │
│   objectQuality: 7,                  │
│   coherenceScore: 7,                 │
│   detectedStrengths: [...],          │
│   detectedIssues: [...],             │
│   recommendations: [...]             │
│ }                                    │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Save to .image-ratings.json          │
│ {                                    │
│   "image.jpg": 7,                    │
│   "image2.jpg": 8                    │
│ }                                    │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Send response to Frontend            │
│ status: 200                          │
│ body: { scores, strengths, etc }    │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Frontend receives response           │
│ Parse JSON                           │
│ Set illustrationAnalysis = result    │
│ (Triggers template update)           │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Update UI with results               │
│ • Show scores (Overall, Anatomy, etc)│
│ • Show strengths (with ✓)            │
│ • Show issues (with ⚠)               │
│ • Show recommendations (with 💡)     │
│ • Clear status message               │
│ • Enable buttons                     │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Call ReviewService.saveImageRatings()│
│ Save rating to .image-ratings.json   │
│ Emit rating to other components      │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ Set isAutoRating = false             │
│ Enable buttons again                 │
│ Show success message                 │
└────┬─────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────┐
│ USER SEES RESULTS                    │
│ Scores, strengths, issues, recs      │
│ Rating saved automatically           │
│ Visible in all features              │
└────┬─────────────────────────────────┘
     │
     ▼
┌─────────┐
│   END   │
└─────────┘
```

---

## 3. Batch Processing Workflow

```
┌─────────────────────────────────────────────────────┐
│ User clicks "🚀 Analyze All"                        │
│ Selects: /path/to/folder with 100 images          │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Frontend: autoRateAllIllustrationsWithAI()          │
│ Generate list of files in folder                   │
│ Create array: [image1.jpg, image2.jpg, ...]        │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Call Backend: POST /api/batch-rating/submit        │
│ Body: {                                             │
│   folderPath: "/path",                              │
│   imageFilenames: [...]                             │
│ }                                                   │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Backend: processBatchJob()                          │
│ Create job: {                                       │
│   jobId: "uuid-123",                                │
│   status: "pending",                                │
│   totalImages: 100,                                 │
│   processedImages: 0,                               │
│   results: {}                                       │
│ }                                                   │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Start async background job (don't wait)             │
│ Return jobId to frontend                           │
│                                                     │
│ MEANWHILE IN BACKGROUND:                            │
│ Loop through each image:                           │
│   ┌─────────────────────────────────────────────┐  │
│   │ Image #1                                     │  │
│   │ ├─ Call Vision API                          │  │
│   │ ├─ Calculate scores                         │  │
│   │ ├─ Save result                              │  │
│   │ ├─ processedImages++                        │  │
│   │ └─ Sleep 500ms (rate limiting)              │  │
│   └─────────────────────────────────────────────┘  │
│   ┌─────────────────────────────────────────────┐  │
│   │ Image #2                                     │  │
│   │ ├─ Call Vision API                          │  │
│   │ ├─ Calculate scores                         │  │
│   │ ├─ Save result                              │  │
│   │ ├─ processedImages++                        │  │
│   │ └─ Sleep 500ms                              │  │
│   └─────────────────────────────────────────────┘  │
│   ... continue for all images ...                  │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Frontend: Poll job status periodically              │
│ GET /api/batch-rating/status/:jobId                │
│                                                     │
│ Display progress:                                   │
│ • Processing 1/100 (1%) - ~99 min remaining        │
│ • Processing 25/100 (25%) - ~74 min remaining      │
│ • Processing 50/100 (50%) - ~49 min remaining      │
│ • Processing 100/100 (100%) - Complete!            │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Backend (Background): Completed all images          │
│ • results = {                                       │
│     "image1.jpg": 7,                                │
│     "image2.jpg": 8,                                │
│     ...                                             │
│   }                                                 │
│ • Save to .image-ratings.json                       │
│ • Set status = "completed"                          │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Frontend: Job complete!                             │
│ Progress bar: 100%                                  │
│ Status: "Completed - All ratings saved"            │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ Rating results now visible:                         │
│ • Artist Gallery shows all ratings                  │
│ • Prompt Grouping shows all ratings                 │
│ • .image-ratings.json saved with all scores         │
└────┬────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────────┐
│ USER ACTION:                                        │
│ • Review results                                    │
│ • Sort by score                                     │
│ • Export data                                       │
│ • Share with team                                   │
└───────────────────────────────────────────────────────┘
```

---

## 4. Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   APP COMPONENT                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │        IMAGE VIEWER MODAL COMPONENT               │ │
│  │                                                    │ │
│  │  ┌──────────────────┐      ┌─────────────────┐   │ │
│  │  │  IMAGE DISPLAY   │      │  METADATA       │   │ │
│  │  │  • Main image    │      │  • Rating       │   │ │
│  │  │  • Zoom controls │      │  • Prompt       │   │ │
│  │  │  • Navigation    │      │  • Artist tags  │   │ │
│  │  │  • Thumbnails    │      │  • Dimensions   │   │ │
│  │  └──────────────────┘      │                 │   │ │
│  │                             │  ┌────────────┐│   │ │
│  │                             │  │ AI ANALYSIS││   │ │
│  │                             │  │ [NEW]      ││   │ │
│  │                             │  │ 🎨 Art     ││   │ │
│  │                             │  │ 🚀 Batch   ││   │ │
│  │                             │  └────────────┘│   │ │
│  │                             │                 │   │ │
│  │                             │  ┌────────────┐│   │ │
│  │                             │  │ RESULTS    ││   │ │
│  │                             │  │ [NEW]      ││   │ │
│  │                             │  │ Scores: 7  ││   │ │
│  │                             │  │ Strengths  ││   │ │
│  │                             │  │ Issues     ││   │ │
│  │                             │  │ Recs       ││   │ │
│  │                             │  └────────────┘│   │ │
│  │                             └─────────────────┘   │ │
│  │                                                    │ │
│  │  Services Injected:                               │ │
│  │  • ReviewService                                  │ │
│  │  • IllustrationQualityService [NEW]              │ │
│  │  • BatchRatingService [NEW]                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │ │
│  ┌───────────────────────────────────────────────────┐ │
│  │    BATCH RATING MANAGER COMPONENT [NEW]          │ │
│  │                                                    │ │
│  │  Shows:                                           │ │
│  │  • Active jobs list                               │ │
│  │  • Progress bar                                   │ │
│  │  • Time remaining                                 │ │
│  │  • Cancel button                                  │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
│  ┌───────────────────────────────────────────────────┐ │
│  │    OTHER COMPONENTS (Unchanged)                  │ │
│  │                                                    │ │
│  │  • ReviewFormComponent                            │ │
│  │  • ReviewsTableComponent                          │ │
│  │  • FilterPanelComponent                           │ │
│  │  • ArtistGalleryComponent                         │ │
│  │  • ArtistGroupingComponent                        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## 5. API Endpoint Flow

```
SINGLE IMAGE ANALYSIS:

POST /api/analyze-illustration
├─ Input: { filePath: "..." }
├─ Process:
│  ├─ Read image file
│  ├─ Encode to Base64
│  ├─ Call Vision API
│  ├─ Extract labels & objects
│  ├─ Calculate scores
│  ├─ Detect strengths/issues
│  └─ Generate recommendations
└─ Output: {
    overallScore: 7,
    anatomyScore: 7,
    poseScore: 6,
    faceQuality: 8,
    backgroundQuality: 6,
    objectQuality: 7,
    coherenceScore: 7,
    detectedStrengths: [...],
    detectedIssues: [...],
    recommendations: [...],
    labels: [...]
   }


BATCH PROCESSING:

1. POST /api/batch-rating/submit
   ├─ Input: { 
   │    folderPath: "...",
   │    imageFilenames: [...]
   │  }
   ├─ Create job with UUID
   ├─ Start background processing
   └─ Output: { jobId, estimatedTime }

2. GET /api/batch-rating/status/:jobId
   ├─ Input: jobId (from step 1)
   └─ Output: {
       jobId: "...",
       status: "processing",
       totalImages: 100,
       processedImages: 25,
       createdAt: "...",
       completedAt: null
      }

3. GET /api/batch-rating/results/:jobId
   ├─ Input: jobId
   ├─ Wait for: status === "completed"
   └─ Output: {
       "image1.jpg": 7,
       "image2.jpg": 8,
       ...
      }


RATING PERSISTENCE:

POST /api/ratings/save
├─ Input: {
│    folderPath: "...",
│    ratings: {
│      "image.jpg": 7,
│      "image2.jpg": 8
│    }
│  }
└─ Save to: .image-ratings.json

GET /api/ratings/load
├─ Input: folderPath
└─ Output: {
    "image.jpg": 7,
    "image2.jpg": 8
   }
```

---

**These diagrams show the complete architecture and workflow of the AI Image Rating System!** 🎨

*For code details, see the implementation files.*
