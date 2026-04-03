# UI Backend Interaction Architecture - Existing Implementation

**Purpose**: Document how Angular UI components interact with Node.js backend services for the existing Artist Registry, Combination Generator, and Base Image Manager features.

---

## System Overview

```
┌─────────────────────────────────────┐
│      Angular Frontend (UI)           │
│  - Components                        │
│  - HTTP Requests via HttpClient      │
│  - RxJS Observables (BehaviorSubject)│
└────────────────┬────────────────────┘
                 │
                 │ HTTP Requests
                 │ JSON Payloads
                 ↓
┌─────────────────────────────────────┐
│   Express Backend (Node.js)          │
│  - HTTP Routes                       │
│  - Service Layer                     │
│  - File Operations                   │
└────────────────┬────────────────────┘
                 │
                 │ File I/O
                 │ Registry/Metadata
                 ↓
┌─────────────────────────────────────┐
│      File System Storage             │
│  - .registry.json                    │
│  - artistName/metadata.json          │
│  - genericBaseImages/                │
└─────────────────────────────────────┘
```

---

## 1. Artist Registry Component

### Component Overview

**File**: `src/app/components/artist-registry/artist-registry.component.ts`

**Purpose**: Manage artist profiles, upload image pairs, and track artist strength metrics

**Key Responsibilities**:
- Display list of artists in registry
- Add new artists
- Upload base image + with_artist image pairs
- Edit artist metadata (anatomy, object, coloring, prompt interpretation)
- Delete artists
- Generate images with artists via Novel AI

### State Management (RxJS BehaviorSubjects)

```typescript
// Main data sources
artists$ = new BehaviorSubject<ArtistRecord[]>([]);           // All artists in registry
selectedFolder$ = new BehaviorSubject<string>('');            // Current registry folder path
isLoading$ = new BehaviorSubject<boolean>(false);             // Loading indicator
error$ = new BehaviorSubject<string>('');                     // Error messages
successMessage$ = new BehaviorSubject<string>('');            // Success feedback

// Base image selection
availableBaseImages$ = new BehaviorSubject<any[]>([]);        // List of base images
selectedBaseImages$ = new BehaviorSubject<string[]>([]);      // Selected for generation
selectedUploadBaseImages$ = new BehaviorSubject<string[]>([]); // Selected for upload

// Image generation
generationJobId$ = new BehaviorSubject<string | null>(null);  // Current job ID
generationProgress$ = new BehaviorSubject<any | null>(null);  // Progress updates
generationResults$ = new BehaviorSubject<any | null>(null);   // Final results
isGenerating$ = new BehaviorSubject<boolean>(false);          // Job in progress
showGenerationResults$ = new BehaviorSubject<boolean>(false);
```

### API Interaction Flow

#### 1. Load Artists from Registry

```
User opens Artist Registry
         ↓
Component calls HTTP GET: /api/artist-registry/list?folderPath={path}
         ↓
Backend (artistRegistryRoutes.js):
  - Calls artistRegistryService.listArtists(folderPath)
  - Reads .registry.json file
  - Returns artist array
         ↓
Frontend receives response
         ↓
UI displays artists in table
  - One row per artist
  - Shows: name, artStyle, strength, confidence, anatomy, object, coloring, promptInterpretation
```

**API Endpoint**:
```javascript
GET /api/artist-registry/list
Query: ?folderPath=string
Response: { success: boolean, artists: ArtistRecord[], count: number }
```

**Artist Record Structure**:
```typescript
interface ArtistRecord {
  id: string;                 // UUID
  name: string;              // Artist identifier
  artStyle: string;          // 'anime', 'realistic', etc.
  strength: number;          // 0-1 calculated hybrid score
  strengthLabel: string;     // 'weak', 'medium', 'strong'
  confidence: number;        // 60-95%
  anatomy: number;           // 0-10 manual attribute
  object: number;            // 0-10 manual attribute
  colouring: number;         // 0-10 manual attribute
  promptInterpretation: number; // 0-10 manual attribute
  imagesCount: number;       // Count of image pairs
  validationStatus: string;  // 'pending', 'analyzing', 'validated'
  lastUpdated: string;       // ISO timestamp
}
```

#### 2. Add New Artist (With Optional Manual Upload + Optional Base Image Selection for Generation)

```
User opens "Add Artist" form
         ↓
Fills artist metadata:
  - Artist name (required)
  - Art style (dropdown, optional)
  - Manual attributes (anatomy, object, coloring, prompt interp) (optional, default: 5)
         ↓
[OPTIONAL] Section 1: Upload image pair
  - Select base image file
  - Select with_artist image file
  - Both required if doing manual upload
         ↓
[OPTIONAL] Section 2: Select base images for generation
  - Displays list of available base images with checkboxes
  - Can select multiple (or use "Select All" / "Clear All" buttons)
  - At least one required if doing generation
         ↓
Click "Add Artist" button
         ↓
Component validates uploadImagePair() logic:
  - Artist name: REQUIRED
  - If image files uploaded: BOTH baseImage AND withArtistImage required
  - If base images selected: AT LEAST ONE required
  - At least one of: manual upload OR base selection must be done
         ↓
Step 1: HTTP POST: /api/artist-registry/add-artist
Payload: { folderPath, name, artStyle, anatomy, object, colouring, promptInterpretation }
         ↓
Backend:
  - Validates required fields
  - Calls artistRegistryService.addArtist(folderPath, artistData)
  - Creates artist folder: registryFolder/artistName/
  - Creates subdirectories: base/, with_artist/
  - Creates metadata.json for image pairs tracking
  - Adds artist to .registry.json
  - Returns new artist record WITH id
         ↓
Frontend: handlePostArtistCreation()
         ↓
Step 2: [IF image files provided]
  HTTP POST: /api/artist-registry/upload-image-pair
  - Uploads base and with_artist image files
  - Backend runs imageAnalysisService.analyzeImagePair()
  - Backend updates .registry.json with initial strength
  - Backend updates metadata.json with pair details
  - Then continue to Step 3...
         ↓
Step 3: [IF base images selected for generation]
  HTTP POST: /api/image-generation/generate
  - Payload: { artistId, artistName, registryFolder, selectedBaseImages, generationParams }
  - Backend queues job to Novel AI API
  - Returns jobId
  - Frontend polls status → show progress → fetch results
  - Keeps dialog open showing generation progress
         ↓
Completion:
  - Shows generation results (if generation was done)
  - Reloads registry and base images list
  - Closes add form dialog
  - WebSocket triggers reload for peer observers
```

**Supported Workflows**:
1. ✅ **Metadata only**: Artist created with no image analysis
2. ✅ **Metadata + manual image pair**: Artist created + pair analyzed for strength
3. ✅ **Metadata + base image selection**: Artist created + images generated with novel AI  
4. ✅ **Metadata + manual + generation**: All three: create → upload pair → generate images

**API Endpoint**:
```javascript
POST /api/artist-registry/add-artist
Payload: {
  folderPath: string,
  name: string,
  artStyle: string,
  anatomy: number,
  object: number,
  colouring: number,
  promptInterpretation: number,
  description?: string,
  notes?: string
}
Response: { success, artist, message }
```

#### 3. Upload/Generate for Existing Artist (Two Workflow Options)

```
User clicks artist row in table
         ↓
Calls initiateUpload(artist)
         ↓
Opens "Upload/Generate" dialog with TWO workflow options:
         ↓
[OPTIONAL] WORKFLOW 1: Upload image pair for analysis
  - Select base image file from computer
  - Select with_artist image file from computer
  - Both files will be uploaded and analyzed
         ↓
[OPTIONAL] WORKFLOW 2: Select base images for generation
  - List all available base images with checkboxes
  - Select one or more (or use "Select All" / "Clear All" buttons)
  - Images will be used for Novel AI generation
         ↓
Click "Submit" button
         ↓
Component logic in uploadImagePair() evaluates scenarios:
         ↓
┌─ SCENARIO 1: Image files uploaded, NO base images selected ─┐
│                                                               │
│  Workflow 1 ONLY                                              │
│                                                               │
│  HTTP POST: /api/artist-registry/upload-image-pair           │
│  FormData:                                                    │
│    - folderPath: string                                       │
│    - artistId: string                                         │
│    - artistName: string                                       │
│    - baseImage: File                                          │
│    - withArtistImage: File                                    │
│                                                               │
│  Backend (uploadImagePairForAnalysis):                        │
│    - Validates artist exists in registry                      │
│    - Saves base to: artistFolder/base/{uuid}.jpg             │
│    - Saves with_artist to: artistFolder/with_artist/{uuid}   │
│    - Calls imageAnalysisService.analyzeImagePair()           │
│             ↓                                                 │
│      [Parallel]:                                              │
│      ├─ LPIPS score (perceptual distance) 0-0.5+             │
│      └─ Vision API score (content analysis) 0-0.4+           │
│             ↓                                                 │
│      Hybrid = (Vision × 0.33) + (LPIPS × 0.67)               │
│             ↓                                                 │
│    - Calls artistRegistryService.updateArtistStrength()      │
│    - Normalizes and recalculates: strength, strengthLabel, confidence  │
│    - Stores lpipsScore[], googleVisionScores[] in .registry.json  │
│    - Stores pair details in metadata.json                     │
│                                                               │
│  Frontend:                                                    │
│    - Clears file inputs (baseImageInput.value = '')          │
│    - Closes dialog (showUploadDialog = false)                │
│    - Resets baseImageFileName, artistImageFileName          │
│    - Shows success: "Image pair uploaded. Analyzing..."      │
│    - [WebSocket listens for validation-complete]             │
│    - Reloads registry from backend                           │
└───────────────────────────────────────────────────────────────┘
         ↓
┌─ SCENARIO 2: Base images selected, NO image files uploaded ──┐
│                                                               │
│  Workflow 2 ONLY                                              │
│                                                               │
│  Calls startImageGenerationFromSelectedBases()                │
│             ↓                                                 │
│  HTTP POST: /api/image-generation/generate                   │
│  Payload:                                                     │
│    - artistId: string                                         │
│    - artistName: string                                       │
│    - registryFolder: string                                   │
│    - selectedBaseImages: string[]  (image filenames)          │
│    - generationParams: { model: 'nai-diffusion-4-5-full' }   │
│                                                               │
│  Backend (imageGenerationRoutes.js):                          │
│    - Validates artist exists                                  │
│    - Validates all selected base images exist                 │
│    - Queues job to Novel AI API                              │
│    - Returns jobId for polling                               │
│                                                               │
│  Frontend:                                                    │
│    - KEEPS dialog open                                        │
│    - Shows loading message                                    │
│    - Shows success: "Starting image generation with..."       │
│    - Clears selectedUploadBaseImages$                         │
│             ↓                                                 │
│    Polling Loop (every 2 seconds, max 300 polls = ~10 min):  │
│    HTTP GET: /api/image-generation/status/{jobId}            │
│      Status: 'queued' | 'processing' | 'completed' |          │
│               'completed_with_errors' | 'failed'              │
│             ↓ (when status === 'completed' or 'completed_with_errors')              │
│    HTTP GET: /api/image-generation/results/{jobId}           │
│      Returns: { generatedCount, totalImages, images[], errors[] }  │
│             ↓                                                 │
│    - Shows generation results in dialog                       │
│    - Displays generated image count                           │
│    - Shows any errors if partial completion                  │
│    - Success: "✅ Image generation complete! Generated X/Y images"  │
│    - Calls completeArtistAddition()                          │
│    - Reloads registry and base images list                    │
└───────────────────────────────────────────────────────────────┘
         ↓
┌─ SCENARIO 3: BOTH image files AND base images selected ──────┐
│                                                               │
│  Workflows 1 + 2 (CHAINED)                                    │
│                                                               │
│  Step A: Upload image pair (like Scenario 1)                 │
│    - Uploads and analyzes pair                               │
│    - Updates artist strength                                 │
│                                                               │
│  Step B: Generate with base images (like Scenario 2)          │
│    - After upload succeeds, triggers generation               │
│    - Polls for results                                        │
│    - Shows results                                            │
│                                                               │
│  Frontend keeps dialog open for entire sequence              │
│    - "Image pair uploaded. Generating with base images..."    │
│    - Shows generation progress                               │
│    - Final: "✅ Image generation complete! Generated X/Y"     │
└───────────────────────────────────────────────────────────────┘
         ↓
┌─ SCENARIO 4: Neither files nor images selected ──────────────┐
│                                                               │
│  ERROR                                                        │
│                                                               │
│  Message: "Please either upload image files or select        │
│            base images for generation"                       │
│                                                               │
│  Dialog remains open for user to select at least one option   │
└───────────────────────────────────────────────────────────────┘
```

**API Endpoint Details**:

Upload image pair endpoint:
```javascript
POST /api/artist-registry/upload-image-pair
ContentType: multipart/form-data
Fields:
  - folderPath: string                 (registry folder path)
  - artistId: string                   (artist UUID)
  - artistName: string                 (artist name)
  - baseImage: File                    (comparison reference)
  - withArtistImage: File              (image to analyze)

Response: {
  success: boolean,
  lpipsScore: number,                  // 0-0.5+ raw score
  googleVisionScore: number,           // 0-0.4+ raw score
  hybridScore: number,                 // 0-1 normalized
  strength: number,                    // 0-1 calculated
  strengthLabel: "weak|medium|strong",
  confidence: number,                  // 60-95%
  message: string
}
```

Generate images endpoint:
```javascript
POST /api/image-generation/generate
ContentType: application/json
Payload: {
  artistId: string,
  artistName: string,
  registryFolder: string,
  selectedBaseImages: string[],        // Filenames of base images
  generationParams: {
    model: 'nai-diffusion-4-5-full'
  }
}

Response: {
  success: boolean,
  jobId: string,                       // UUID for polling
  message: string
}
```

Generation status polling:
```javascript
GET /api/image-generation/status/{jobId}
Response: {
  success: boolean,
  status: "queued|processing|completed|completed_with_errors|failed",
  progress: number,                    // 0-100%
  message: string,
  generatedCount?: number,
  totalImages?: number
}
```

Generation results:
```javascript
GET /api/image-generation/results/{jobId}
Response: {
  success: boolean,
  generatedCount: number,
  totalImages: number,
  images: Array<{ path, name, dimensions }>,
  errors: string[],
  status: "completed|completed_with_errors"
}
```

```
User clicks edit/pencil icon on artist row
         ↓
Calls initiateEdit(artist)
         ↓
Populates editArtistForm with current values:
  - anatomy (0-10)
  - object (0-10)
  - colouring (0-10)
  - promptInterpretation (0-10)
  - artStyle
         ↓
Shows edit modal dialog
         ↓
User updates attribute values (0-10 sliders or inputs)
         ↓
Click "Save Changes" button
         ↓
Component validates form
         ↓
HTTP PUT: /api/artist-registry/{artistId}
Payload: { folderPath, anatomy?, object?, colouring?, promptInterpretation?, artStyle? }
         ↓
Backend (artistRegistryRoutes.js):
  - Validates artistId exists
  - Calls artistRegistryService.updateArtist(folderPath, artistId, updateData)
  - Updates ONLY specified fields in .registry.json
  - Returns updated artist record
         ↓
Frontend:
  - Updates artist in local list (artists$ observable)
  - Shows success message: "Scoring updated for {artist.name}"
  - Closes edit dialog
  - Does NOT recalculate strength (strength is auto-calculated from LPIPS/Vision only)
  - Manual attributes are for informational/display purposes only
```

**API Endpoint**:
```javascript
PUT /api/artist-registry/:artistId
Payload: {
  folderPath: string,
  anatomy?: number,        // 0-10
  object?: number,         // 0-10
  colouring?: number,      // 0-10
  promptInterpretation?: number,  // 0-10
  artStyle?: string
}

Response: {
  success: boolean,
  artist: ArtistRecord,
  message: string
}
```

#### 5. Delete Artist

```
User clicks delete/trash icon on artist row
         ↓
Shows confirmation dialog:
  "Are you sure you want to delete {artist.name}?
   This will remove all images and data permanently."
         ↓
User confirms deletion
         ↓
HTTP DELETE: /api/artist-registry/{artistId}
Payload: { folderPath }
         ↓
Backend (artistRegistryRoutes.js):
  - Validates artistId exists
  - Calls artistRegistryService.deleteArtist(folderPath, artistId)
  - Removes entire artist folder and all contents (images, metadata.json)
  - Removes artist record from .registry.json
  - Returns success response
         ↓
Frontend:
  - Shows success message: "{artist.name} deleted successfully"
  - Removes artist from local artists$ observable
  - List refreshes automatically (virtual scroll updates)
  - Dialog closes
```

**API Endpoint**:
```javascript
DELETE /api/artist-registry/:artistId
Payload: {
  folderPath: string        // Registry folder path
}

Response: {
  success: boolean,
  message: string
}
```

---

## 2. Combination Generator Component

### Component Overview

**File**: `src/app/components/combination-generator/combination-generator.component.ts`

**Purpose**: Generate artist combinations based on user input using NLP matching

**Key Responsibilities**:
- Accept user natural language input
- Match artists from registry
- Generate 5 combination suggestions
- Each suggestion includes artist names, roles, emphasis weights
- Format suggestions for Novel AI prompt
- Save combinations locally
- Display saved combinations

### State Management

```typescript
suggestions$ = new BehaviorSubject<CombinationSuggestion[]>([]);
savedCombinations$ = new BehaviorSubject<SavedCombination[]>([]);
selectedFolder$ = new BehaviorSubject<string>('');
isLoading$ = new BehaviorSubject<boolean>(false);
error$ = new BehaviorSubject<string>('');
successMessage$ = new BehaviorSubject<string>('');
copiedSuggestionIndex$ = new BehaviorSubject<number | null>(null);
copiedSavedId$ = new BehaviorSubject<string | null>(null);
```

### API Interaction Flow

#### 1. Generate Combination Suggestions

```
User enters text input:
  "anime realistic strong character anatomy"
         ↓
Optionally sets maxSuggestions (default: 5)
         ↓
Click "Generate Combinations"
         ↓
Component validates form (min 10 chars)
         ↓
HTTP POST: /api/combination-generator/generate
Payload: { folderPath, userInput, maxSuggestions }
         ↓
Backend (combinationGeneratorRoutes.js):
  - Loads all artists from registry via artistRegistryService.listArtists()
  - Calls combinationGeneratorService.generateCombinations(artists, userInput, maxSuggestions)
           ↓
combinationGeneratorService Flow:
  1. Parse user input with NLP:
     - Detect art styles (anime, realistic, etc.)
     - Detect attributes (anatomy, objects, coloring, background, expression)
     - Detect intensity (subtle, moderate, strong, very strong)
           ↓
  2. Find matching artists:
     - Match artists by detected artStyle
     - Score by manual attributes (anatomy, object, colouring, promptInterpretation)
     - Apply strength bonus for strong artists (>0.7)
     - Return ~20 matched artists ranked by matchScore
           ↓
  3. Apply 4 generation strategies to fill maxSuggestions slots:
     
     Strategy 1: Primary + Complementary (1 slot)
       - Top matched artist as primary (emphasis: 1.3)
       - Find 5 complementary artists (different style, strong at weak areas)
       - Return best combo
     
     Strategy 2: Equally-Weighted (1 slot)
       - Top 6 matched artists
       - All emphasis = 1.0
       - Equal roles
     
     Strategy 3: Attribute-Focused (2 slots)
       - For each key attribute: pair strongest with weakest
       - Optimize per-dimension improvement
     
     Strategy 4: Subset Combinations (1 slot)
       - Various 2-5 artist combinations
       - Different starting positions
           ↓
  4. Calculate emphasis for each artist:
     - Base preference by role (primary 1.3, secondary 0.9, etc.)
     - Intensity multiplier (weak 0.85, strong 1.15, etc.)
     - Attribute bonus (0.9-1.2 based on match)
     - Strength adjustment (weak boost 1.2, strong reduce 0.9)
     - Formula: base × intensity × attribute × strength
     - Clamp to Novel AI range: 0.7-1.6
           ↓
  5. Normalize emphasis:
     - Ensure no single artist dominates
     - Redistribute to 0.8-1.3 range if needed
           ↓
  6. Rank combinations:
     - Variety bonus (more artists = better, max 0.3)
     - Match quality (40% of score)
     - Artist strength (20% of score)
     - Role diversity bonus (10%, if varied roles)
     - Final score: 0-1 scale
     - Confidence: 70-100% based on score
           ↓
  7. Return top 5 suggestions with explanations
           ↓
Response: {
  success: boolean,
  input: string,
  parsed: {
    detectedStyles: [...],
    detectedAttributes: {...},
    styleIntensity: {...}
  },
  suggestions: [
    {
      artists: [
        { artist, role, emphasis },
        ...
      ],
      rankScore: 0-1,
      confidence: "75%",
      explanation: "Primary anime focus with complement...",
      promptFormat: "1.3::artist:Name1::, 0.9::artist:Name2::"
    }
  ],
  matchedArtists: number,
  timestamp: string
}
         ↓
Frontend:
  - Displays 5 suggestion cards
  - Each shows: artist names, roles, emphasis weights
  - Copy-to-clipboard: promptFormat string
  - Shows explanation and confidence
  - User can save any suggestion
```

**API Endpoint**:
```javascript
POST /api/combination-generator/generate
Payload: {
  folderPath: string,
  userInput: string,
  maxSuggestions?: number  // Default: 5
}
Response: {
  success: boolean,
  input: string,
  parsed: {
    detectedStyles: Array<{style, confidence}>,
    detectedAttributes: {anatomy, objects, coloring, background, expression},
    styleIntensity: {intensity, confidence}
  },
  suggestions: Array<CombinationSuggestion>,
  matchedArtists: number,
  timestamp: string
}
```

**CombinationSuggestion Structure**:
```typescript
interface CombinationSuggestion {
  artists: Array<{
    artist: ArtistRecord,
    role: string,           // 'primary' | 'secondary' | 'complementary' | 'accent' | 'balanced'
    emphasis: number        // 0.7-1.6 Novel AI weight
  }>,
  rankScore: number,        // 0-1 quality score
  confidence: string,       // "XX%" confidence
  explanation: string,      // Human-readable reasoning
  promptFormat: string      // For Novel AI: "1.3::artist:Name1::, 0.9::artist:Name2::"
}
```

#### 2. Save Combination

```
User sees suggestion they like
         ↓
Clicks "Save" button
         ↓
Modal prompts for combination name
  "Realistic Character Study"
         ↓
HTTP POST: /api/combination-generator/save-combination
Payload: { combination: CombinationSuggestion, name: string }
         ↓
Backend:
  - Generates UUID for combination
  - Saves to local storage (JSON file)
  - Returns saved combination record
         ↓
Frontend:
  - Shows success message
  - Refreshes saved combinations list
```

**API Endpoint**:
```javascript
POST /api/combination-generator/save-combination
Payload: {
  combination: CombinationSuggestion,
  name: string
}
Response: {
  success: boolean,
  saved: SavedCombination,
  message: string
}
```

#### 3. Load Saved Combinations

```
On component init OR user clicks "View Saved"
         ↓
HTTP GET: /api/combination-generator/saved
         ↓
Backend:
  - Loads all saved combinations from local storage
  - Returns array sorted by creation date
         ↓
Frontend:
  - Displays list of saved combinations
  - Each shows: name, artist names, created date
  - Can copy promptFormat or delete
```

**API Endpoint**:
```javascript
GET /api/combination-generator/saved
Response: {
  success: boolean,
  combinations: SavedCombination[],
  count: number
}
```

---

## 3. Base Image Manager Component

### Component Overview

**File**: `src/app/components/base-image-manager/base-image-manager.component.ts`

**Purpose**: Manage reusable base images in genericBaseImages folder

**Key Responsibilities**:
- Upload new base images
- List available base images
- Delete base images
- Display image thumbnails
- Support multiple file formats (PNG, JPG, WebP)

### State Management

```typescript
baseImages$ = new BehaviorSubject<any[]>([]);
isLoading$ = new BehaviorSubject<boolean>(false);
error$ = new BehaviorSubject<string | null>(null);
success$ = new BehaviorSubject<string | null>(null);
```

### API Interaction Flow

#### 1. Load Base Images

```
Component initializes with registryFolder input
         ↓
Calls ngOnInit() or ngOnChanges()
         ↓
HTTP GET: /api/base-images/list?registryFolder={path}
         ↓
Backend (baseImageRoutes.js):
  - Calls baseImageManagerService.listBaseImages(registryFolder)
  - Reads genericBaseImages/ folder
  - Extracts metadata for each file:
    - filename
    - size (bytes)
    - created date
    - dimensions (if extractable)
    - colorSpace
  - Returns array of image metadata
         ↓
Frontend:
  - Displays images in grid layout
  - Shows thumbnail or filename
  - Shows file size and dimensions
  - Shows delete button per image
```

**API Endpoint**:
```javascript
GET /api/base-images/list
Query: ?registryFolder=string
Response: {
  success: boolean,
  images: Array<{
    name: string,
    path: string,
    size: number,
    created: Date,
    modified: Date,
    metadata: {
      width: number,
      height: number,
      colorSpace: string
    }
  }>
}
```

#### 2. Upload Base Image

```
User selects image file from local disk
         ↓
Component reads file as base64 in browser
         ↓
Prepares payload:
  - File data (base64 string)
  - Filename
  - Registry folder path
         ↓
HTTP POST: /api/base-images/upload
ContentType: application/json
Payload: { imageBase64, filename, registryFolder }
         ↓
Backend:
  - Validates registry folder path
  - Validates filename (no path traversal)
  - Validates file format (PNG, JPG, JPEG, WebP only)
  - Converts base64 to buffer
  - Saves to: registryFolder/genericBaseImages/{filename}
  - Extracts metadata (dimensions, colorSpace)
  - Returns success response
         ↓
Frontend:
  - Shows success message
  - Reloads base images list
  - Clears file selection
```

**API Endpoint**:
```javascript
POST /api/base-images/upload
Payload: {
  imageBase64: string,     // Base64 encoded image
  filename: string,        // Original filename
  registryFolder: string   // Path to registry
}
Response: {
  success: boolean,
  path: string,
  message: string,
  metadata?: {
    width: number,
    height: number
  }
}
```

**Validation Rules**:
- File formats: PNG, JPG, JPEG, WebP only
- Max file size: 50MB
- Filename: No path traversal (no `..`, `/`, `\`)

#### 3. Delete Base Image

```
User clicks delete icon on image
         ↓
Shows confirmation dialog
         ↓
User confirms
         ↓
HTTP DELETE: /api/base-images/{filename}?registryFolder={path}
         ↓
Backend:
  - Validates filename (no path traversal)
  - Validates registry folder path
  - Deletes file from registryFolder/genericBaseImages/{filename}
  - Returns success response
         ↓
Frontend:
  - Shows success message
  - Reloads base images list
```

**API Endpoint**:
```javascript
DELETE /api/base-images/:filename
Query: ?registryFolder=string
Response: {
  success: boolean,
  message: string
}
```

---

## 4. Data Flow Diagrams

### Artist Strength Calculation Flow

```
Upload Image Pair
        ↓
imageAnalysisService.analyzeImagePair(base, with_artist)
        ↓
[Parallel]
├─ LPIPS Score (0-0.5+)
└─ Vision API Score (0-0.4+)
        ↓
Normalize: LPIPS/0.5, Vision/0.4 → 0-1 range
        ↓
Hybrid = (Vision × 0.33) + (LPIPS × 0.67)
        ↓
artistRegistryService.updateArtistStrength()
        ↓
Calculate average from all pairs' lpipsScores[] and googleVisionScores[]
        ↓
Result: strength (0-1), strengthLabel, confidence (60-95%)
        ↓
Save to .registry.json (aggregate) + metadata.json (per-pair)
```

### Combination Generation Flow

```
User Input: "anime realistic strong character anatomy"
        ↓
Parse NLP:
├─ Styles: [anime, realistic]
├─ Attributes: [anatomy]
└─ Intensity: strong
        ↓
Match artists from registry
├─ Filter by style
├─ Score by attributes (anatomy ≥ 5)
└─ Rank by strength
        ↓
Apply 4 strategies → generate combos
        ↓
Calculate emphasis per artist
├─ Base preference (by role)
├─ Intensity multiplier
├─ Attribute bonus
└─ Strength adjustment
        ↓
Normalize emphasis (prevent dominance)
        ↓
Rank combinations (variety, match, strength, diversity)
        ↓
Return top 5 with explanations
```

---

## 5. File Storage Structure

### Registry Folder Organization

```
registryFolder/
├── .registry.json                    # Main registry index
│   └── artists: [
│       {
│         id, name, strength, strengthLabel, confidence
│       }
│     ]
│
├── genericBaseImages/                # Reusable base images
│   ├── landscape.jpg
│   ├── character.png
│   └── study.webp
│
└── artistName1/
    ├── metadata.json                 # Per-pair details
    │   └── pairs: [
    │       {
    │         id, lpipsScore, googleVisionScore,
    │         baseImage, withArtistImage
    │       }
    │     ]
    │
    ├── base/                         # Base images for this artist
    │   ├── {uuid}.jpg
    │   └── {uuid}.jpg
    │
    └── with_artist/                  # Generated/uploaded with artist
        ├── {uuid}.jpg
        └── {uuid}.jpg
```

---

## 6. Error Handling

### Frontend Error Handling

```typescript
// Pattern: HTTP call with error handling
this.http.post('/api/endpoint', payload).subscribe({
  next: (response: any) => {
    // Success path
    this.successMessage$.next('Operation successful');
    this.refreshData();
  },
  error: (error) => {
    // Error path
    console.error('Error:', error);
    this.error$.next(
      error.error?.message || 
      error.error?.details || 
      error.message
    );
    this.isLoading$.next(false);
  }
});
```

### Common Error Scenarios

| Scenario | Error | Status | Frontend Action |
|----------|-------|--------|-----------------|
| Folder not found | "folderPath does not exist" | 400 | Show folder picker |
| Invalid image format | "Invalid file type" | 400 | Show format help |
| File too large | "File exceeds 50MB" | 400 | Ask user to compress |
| Artist not found | "Artist {id} not found" | 404 | Refresh artist list |
| Registry locked | "Registry file in use" | 409 | Retry or show message |

---

## 7. Performance Considerations

### Caching Strategies

**Frontend**:
- `artistImagePairsCache` in artist registry component
- Browser localStorage for folder path and saved combinations
- RxJS shareReplay for HTTP requests

**Backend**:
- In-memory cache in imageAnalysisService for LPIPS/Vision results
- File system caching (OS level)
- No database—file I/O is primary bottleneck

### Optimization Points

1. **Large artist registries (100+ artists)**:
   - Pagination in artist list
   - Lazy load analysis details
   - Batch load base images

2. **Combination generation (high NLP cost)**:
   - Cache combination suggestions per user input
   - Debounce user input changes
   - Limit maxSuggestions (default: 5)

3. **Image analysis (LPIPS + Vision API)**:
   - Parallel execution (Promise.all)
   - In-memory cache results per image pair
   - Show progress indicator

---

## 8. Security Considerations

### Input Validation

| Layer | Validation |
|-------|-----------|
| Frontend | Form validation, file type check, size limit |
| Backend | Path traversal prevention, file MIME type, size limits |
| Storage | Folder permission checks |

### Path Traversal Prevention

```javascript
// Bad: ❌ allows ../../../etc/passwd
const filePath = `${registryFolder}/${userInput}`;

// Good: ✅ rejects path traversal attempts
const filename = path.basename(userInput);  // Strip path components
const filePath = path.join(registryFolder, filename);
```

---

## Summary

This is the existing implementation architecture that provides:

✅ **Clean separation**: UI (Angular) ↔ Backend (Express) ↔ File System  
✅ **Reactive**: All state managed via RxJS Observables  
✅ **Stateless REST**: Backend doesn't depend on session state  
✅ **Type-safe**: Interfaces defined for key data structures  
✅ **Error handling**: Graceful degradation and user feedback  
✅ **Performance**: Caching at multiple levels  

