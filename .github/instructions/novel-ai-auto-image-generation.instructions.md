# Novel AI Automatic Image Generation Integration

## Overall Goal
Streamline the Artist Registry workflow by enabling automatic generation of test images using Novel AI API. When users add a new artist, they can:
1. Select multiple base images (either previously uploaded or from a pool of generic base images)
2. Submit the artist registration form
3. Have the app automatically generate images with the artist tag for each selected base image
4. Automatically measure artist strength using Google Vision + LPIPS analysis

Additionally, provide a dedicated Base Image Manager UI for users to upload base images to a "genericBaseImages" folder without any artist tags, creating a reusable pool of test images.

## Architecture: Two-Feature Design

### Feature 1: Base Image Manager (Standalone Utility)
**Purpose**: Allow users to build a library of base images for future use

- User selects artist registry folder
- App creates `genericBaseImages/` subfolder if it doesn't exist
- UI provides file upload interface
- Base images should NOT contain any artist tags
- Images are extracted/stored in standardized location for reuse across multiple artist tests

**Storage Structure**:
```
artist_registry_folder/
├── genericBaseImages/
│   ├── base_image_1.png
│   ├── base_image_2.png
│   └── ...
├── artist_1/
├── artist_2/
└── ...
```

### Feature 2: Integrated Image Generation (Part of Artist Registry)
**Purpose**: Generate test images when adding a new artist

**Workflow**:
1. User opens "Add New Artist" form
2. Form shows list of available base images (from both `genericBaseImages/` and any existing artist folders)
3. User selects multiple base images
4. User fills out artist details (name, art style, anatomy, object, colouring, promptInterpretation)
5. User submits the form (no manual image upload required)
6. App automatically:
   - Extracts generation parameters from selected base image metadata
   - Prepends artist tag to the prompt (at TOP: "artist: artist_name, [original_prompt]")
   - Generates image using Novel AI API
   - Saves generated image to `artist_name/with_artist/` folder
   - Saves generation metadata JSON
   - Triggers Google Vision + LPIPS analysis
   - Calculates default strength
   - Updates artist registry with results

**Key Properties**:
- Artist tag placement: **TOP OF PROMPT** (not removed from original)
- Base images remain unchanged in their original locations
- Generated images stored in artist-specific folders
- Existing manual upload feature still available (user can still upload base+with_artist pairs manually)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Angular)                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  FEATURE 1: Base Image Manager Component                              │
│  ├─ Select local folder                                               │
│  ├─ File upload UI → genericBaseImages/                               │
│  ├─ List uploaded base images                                         │
│  └─ Delete/manage base images                                         │
│                                                                        │
│  FEATURE 2: Artist Registry Component (MODIFIED)                      │
│  ├─ Add Artist Form (existing)                                        │
│  ├─ + NEW: Base Image Selector (multi-select)                         │
│  │   └─ Lists images from genericBaseImages/ + any folder             │
│  ├─ + NEW: Image Generation Progress Monitor                          │
│  └─ + NEW: Results Display (generated images + analysis)              │
│                                                                        │
└────────────────┬─────────────────────────────────────────────────────┘
                 │ HTTP Requests
                 ↓
┌────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js)                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  FEATURE 1: Base Image Manager Routes                                 │
│  ├─ POST /api/base-images/upload                                      │
│  ├─ GET /api/base-images/list?folder=path                             │
│  └─ DELETE /api/base-images/:id                                       │
│                 ↓                                                      │
│  FileSystemService (existing)                                         │
│  └─ ensureDirectoryExists, createFolder, etc.                         │
│                                                                        │
│  FEATURE 2: Image Generation Routes (NEW)                             │
│  ├─ POST /api/artist-registry/:artistId/generate-images              │
│  │  (triggered after artist creation)                                │
│  ├─ GET /api/generation-jobs/:jobId/status                            │
│  └─ GET /api/generation-jobs/:jobId/results                           │
│                 ↓                                                      │
│  NovelAiService (NEW)                                                 │
│  ├─ buildPayload(prompt, params, artistName)                          │
│  │  └─ Prepends artist tag to TOP of prompt                           │
│  ├─ makeGenerationRequest(payload)                                    │
│  ├─ saveGeneratedImage(buffer, artistFolder, metadata)                │
│  └─ createGenerationMetadata(params)                                  │
│                 ↓                                                      │
│  ImageMetadataService (existing)                                      │
│  └─ extractMetadata(imagePath) - extract params from base image       │
│                 ↓                                                      │
│  VisionAnalysisService + LpipsService (existing)                      │
│  └─ Auto-analyze generated images + calculate strength                │
│                 ↓                                                      │
│  ArtistRegistryService (existing)                                     │
│  └─ Update artist record with new images + strength                   │
│                                                                        │
└────────────────┬─────────────────────────────────────────────────────┘
                 │ HTTPS Requests
                 ↓
        ┌────────────────────────────┐
        │   Novel AI API             │
        │  POST /ai/generate-image   │
        │  Returns: zip with images  │
        └────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Base Image Manager (Standalone Utility)
**Status**: Ready to implement

#### 1.1 Create BaseImageManagerService
**File**: `server/services/baseImageManagerService.js`

**Responsibilities**:
- Manage base image uploads to `genericBaseImages/` folder
- List base images in a folder
- Delete base images
- Validate base images (ensure PNG format, valid metadata)
- Handle folder structure creation

**Key Methods**:
```
- constructor(logger)
- ensureGenericBaseImagesFolder(registryFolder) → creates folder if not exists
- uploadBaseImage(filePath, registryFolder) → saves to genericBaseImages/
- listBaseImages(registryFolder) → returns array of base image info
- deleteBaseImage(registryFolder, imageName) → removes file
- isValidBaseImage(imagePath) → validates format and metadata
```

**Dependencies**:
- `fs` (Node.js native)
- `logger` utility

#### 1.2 Create BaseImageManager Routes
**File**: `server/routes/baseImageRoutes.js`

**Endpoints**:

1. **POST /api/base-images/upload**
   - Upload a new base image to genericBaseImages folder
   - Request body: `{ registryFolder, imageBase64, filename }`
   - Response: `{ success, path, message }`
   - Validation: Check duplicate names, valid image format

2. **GET /api/base-images/list?folderPath=...**
   - List all available base images (including metadata preview)
   - Response: `{ success, images: [{ name, path, metadata, ... }] }`
   - Lists from: `genericBaseImages/` folder
   - Returns metadata for preview

3. **DELETE /api/base-images/:imageName?folderPath=...**
   - Delete a base image
   - Response: `{ success, message }`
   - Safety: Only allows deletion from genericBaseImages folder

#### 1.3 Integration with server.modular.js
```javascript
// Add imports
const BaseImageManagerService = require('./server/services/baseImageManagerService');
const createBaseImageRoutes = require('./server/routes/baseImageRoutes');

// Initialize service
const baseImageManagerService = new BaseImageManagerService(logger);

// Mount routes
app.use('/api/base-images', createBaseImageRoutes(baseImageManagerService, imageMetadataService));
```

---

### Phase 2: Image Generation Service

#### 2.1 Create NovelAiService
**File**: `server/services/novelAiService.js`

**Responsibilities**:
- Extract image from API response (zip file)
- Save generated images to disk
- Create generation metadata

**Metadata Comment Extraction Process**:

When generating images with an artist tag, the service extracts the base image metadata and uses its `comment` field as the prompt source:

1. **Load Base Image**: Get PNG file from `genericBaseImages/` or other folders
2. **Extract Metadata**: Use `ImageMetadataService.extractMetadata(imagePath)` to read embedded PNG metadata
3. **Extract Comment Field**: Get `metadata.comment` property (contains the original prompt)
4. **Prepend Artist Tag**: Build request input as: `"artist: artistName, " + comment`
5. **Build Request Body**: 
   - Use the artist-tagged prompt as `input` field
   - Copy `parameters.*` fields from metadata
   - Preserve all generation settings (steps, sampler, scale, seed, v4_prompt, v4_negative_prompt, etc.)
6. **Send to Novel AI API**: POST the complete request body

**Usage Examples**:

If base image metadata contains:
```json
{
  "comment": "1girl, masterpiece, best quality, realistic, [dynamic angle], location",
  "parameters": {
    "steps": 23,
    "scale": 5.0,
    "sampler": "k_euler_ancestral",
    ...
  }
}
```

And artist name is `"yd_(orange_maru)"`:

The NovelAiService will generate:
```json
{
  "input": "artist: yd_(orange_maru), 1girl, masterpiece, best quality, realistic, [dynamic angle], location",
  "model": "nai-diffusion-4-5-full",
  "parameters": {
    "steps": 23,
    "scale": 5.0,
    "sampler": "k_euler_ancestral",
    ...
  }
}
```

**Key Points**:
- The `comment` field is the ONLY source for the prompt (not other metadata fields)
- Artist tag goes at the **VERY TOP**: `"artist: {artistName}, "`
- All generation parameters from metadata are preserved and transmitted to API
- If metadata is missing the `comment` field, default to a basic descriptor (e.g., "1girl, masterpiece")
- All special characters in comments are preserved (brackets, braces, parentheses, etc.)

---

**Key Methods**:
```
- constructor(apiKey, logger)
- buildPayload(metadataOrPrompt, artistName, generationParams) 
  → Extracts prompt from metadata.comment (if metadata object provided)
  → Prepends "artist: artistName" to TOP of extracted prompt
  → Builds full request body with all generation parameters
- extractPromptFromMetadata(metadata) 
  → Extracts comment field from image metadata
  → Returns prompt string for use in request
- makeGenerationRequest(payload) → HTTPS POST to Novel AI
- extractImageFromZip(zipBuffer) → Extract PNG from zip response
- saveGeneratedImage(imageBuffer, artistFolder, imageType, metadata)
- createGenerationMetadata(originalMetadata, artistName, generationId)
```

**API Implementation Details**:
- **Endpoint**: `POST https://image.novelai.net/ai/generate-image`
- **Authentication**: Bearer token in Authorization header (format: `Authorization: Bearer <api-key>`)
- **Available Models**: `nai-diffusion-4-5-full` (default), `nai-diffusion-4-5-curated`, `nai-diffusion-4-full`, `nai-diffusion-4-curated`, `nai-diffusion-3`, `nai-diffusion-furry-3`
- **Default Model**: `nai-diffusion-4-5-full` ✅
- **Request Format**:
  ```json
  {
    "input": "artist: artist_name, original_prompt_text",
    "model": "nai-diffusion-3",
    "parameters": {
      "width": 832,
      "height": 1216,
      "steps": 28,
      "scale": 5.0,
      "sampler": "k_euler_ancestral",
      "seed": random_or_extracted,
      "n_samples": 1,
      "noise_schedule": "karras"
    }
  }
  ```
- **Response**: ZIP file containing generated PNG
- **Status Code**: 201 (Created)
- **Artist Tag Placement**: TOP of input string (e.g., "artist: yd_(orange_maru), 1girl, masterpiece, ...")

#### 2.2 Create Image Generation Routes
**File**: `server/routes/imageGenerationRoutes.js`

**Endpoints**:

1. **POST /api/artist-registry/generate-images**
   - Triggered after artist is created
   - Request body:
     ```json
     {
       "artistId": "artist_001",
       "artistName": "artist_name",
       "registryFolder": "/path/to/registry",
       "selectedBaseImages": ["image1.png", "image2.png"],
       "generationParams": { ... }
     }
     ```
   - Response: `{ success, jobId, estimatedTime }`
   - Logic:
     - Create background job for generation
     - For each selected base image:
       - Extract metadata
       - Call Novel AI API
       - Save result
       - Trigger analysis
     - Update artist registry

2. **GET /api/generation-jobs/:jobId/status**
   - Check generation job status
   - Response: `{ success, status, progress, currentImage, estimatedTimeRemaining }`
   - Statuses: pending, generating, analyzing, completed, failed

3. **GET /api/generation-jobs/:jobId/results**
   - Get final results of completed job
   - Response:
     ```json
     {
       "success": true,
       "job": {
         "artistId": "artist_001",
         "totalImages": 2,
         "generated": 2,
         "generatedImages": [
           { "filename": "...", "path": "...", "analysisResult": {...} },
           { "filename": "...", "path": "...", "analysisResult": {...} }
         ],
         "strength": 0.75,
         "confidence": 80,
         "completedAt": "..."
       }
     }
     ```

#### 2.3 Update ArtistRegistryRoutes
**File**: `server/routes/artistRegistryRoutes.js` (MODIFY existing)

When artist is **created successfully**:
1. Call `POST /api/artist-registry/generate-images` automatically
2. Pass:
   - Artist ID and name
   - Selected base images from the form
   - Generation parameters extracted from base image metadata

**Modified Flow**:
```
User submits Add Artist form
        ↓
Form validation passes
        ↓
Artist record created in registry
        ↓
image-generation job queued (background)
        ↓
Response to frontend with jobId + artistId
        ↓
Frontend polls /api/generation-jobs/:jobId/status for progress
        ↓
Images generated, analyzed, strength calculated
        ↓
Artist registry updated with results
        ↓
Frontend polls detect completion, display results
```

---

### Phase 3: Frontend Components

#### 3.1 Create Base Image Manager Component
**File**: `src/app/components/base-image-manager/`

**Responsibilities**:
- Provide UI for uploading base images to genericBaseImages folder
- Display list of uploaded base images
- Allow deletion of base images
- Standalone utility (not part of artist registry form)

**Structure**:
- `base-image-manager.component.ts` - Logic for upload/list/delete
- `base-image-manager.component.html` - Upload and list UI
- `base-image-manager.component.scss` - Styling

**Key Features**:
- File picker for selecting images
- Drag-and-drop upload
- List of uploaded base images with thumbnails
- Delete button for each image
- Error/success messages
- Folder selection at top

#### 3.2 Modify Artist Registry Component
**File**: `src/app/components/artist-registry/`

**Additions**:
1. **Base Image Selector Section** (NEW in Add Form)
   - Shows available base images
   - Multi-select checkboxes
   - Displays image previews
   - Shows extracted metadata preview for selected images
   - Section only visible in "Add New Artist" mode

2. **Generation Progress Monitor** (NEW in Add Form)
   - Visible after artist submission
   - Shows progress bar
   - Lists which images are being generated
   - Real-time polling of job status
   - Error notifications with retry option

3. **Generation Results Display** (NEW in Add Form)
   - After generation completes
   - Shows generated images with thumbnails
   - Displays analysis results
   - Shows calculated strength
   - Option to view details or return to registry

**Modifications to Existing Code**:
- `addArtistForm`: Add field for selected base images
- `onAddArtist()`: Changed to:
  1. Create artist record
  2. Get jobId from response
  3. Start polling generation status
  4. Display progress UI
  5. After completion, refresh registry

**New Properties**:
```typescript
- selectedBaseImages$: BehaviorSubject<string[]>
- generationJobId$: BehaviorSubject<string | null>
- generationProgress$: BehaviorSubject<GenerationProgress | null>
- generationResults$: BehaviorSubject<GenerationResults | null>
- isGenerating$: Computed (true while jobId is not null)
```

**New Methods**:
```typescript
- loadAvailableBaseImages()
- selectBaseImage(imageName, selected: boolean)
- onSubmitAddArtist() - changed from onAddArtist
- pollGenerationStatus(jobId)
- onGenerationComplete(results)
- retryGeneration()
```

#### 3.3 Create Generation Status Monitoring UI
**Status Polling Component** (reusable):
- Real-time job status display
- Progress bar with percentage
- List of images being processed
- Cancel button (if needed)
- Auto-refresh interval (2 seconds)
- Smooth animations for status changes

---

### Phase 4: Integration Points

#### 4.1 Artist Registry Form Flow (MODIFIED)

**Old Flow**:
```
User fills form → Submit → Artist created → Return to list
```

**New Flow**:
```
User fills form
        ↓
+ Selects base images (multi-select)
        ↓
Submits form
        ↓
Backend creates artist record
        ↓
Backend queues generation job (background)
        ↓
Frontend receives jobId
        ↓
Frontend shows generation progress UI (real-time polling)
        ↓
Generation completes (multi-image, with analysis)
        ↓
Frontend shows results preview
        ↓
User can view generated images or return to registry
        ↓
Artist registry updated with generated images + strength
```

#### 4.2 Navigation Integration
**Add new navigation section** (or tab in existing):
```html
<a routerLink="/artist-registry/base-images" routerLinkActive="active">
  Base Image Manager
</a>
```

Add route:
```typescript
{
  path: 'artist-registry',
  component: ArtistRegistryComponent,
  children: [
    { path: 'base-images', component: BaseImageManagerComponent },
    { path: '', component: ArtistRegistryComponent }  // Default view
  ]
}
```

---

### Phase 5: Configuration & Deployment

#### 5.1 Environment Setup
**File**: `.env` (create in project root)

```
# Novel AI API Configuration
NOVEL_AI_API_KEY=pst-1aE7y5vmMMufGP67TVIkERk4KsHtLrnpl8efGlHLSjC0qxIid01sZJD9auJXGiN1

# Optional: Override API endpoint
# NOVEL_AI_API_ENDPOINT=https://image.novelai.net/ai/generate-image

# Background job configuration
GENERATION_JOB_TIMEOUT_MINUTES=15
GENERATION_POLLING_INTERVAL=2000

# Logging
LOG_LEVEL=INFO
```

**File**: `.env.example` (template)
```
NOVEL_AI_API_KEY=your-api-key-here
GENERATION_JOB_TIMEOUT_MINUTES=15
GENERATION_POLLING_INTERVAL=2000
LOG_LEVEL=INFO
```

#### 5.2 Dependencies
Need to add to `package.json`:
```json
{
  "dotenv": "^10.0.0",
  "archiver": "^6.0.0"  // For handling zip file responses
}
```

Install:
```bash
npm install dotenv archiver
```

#### 5.3 Setup Instructions

1. **Create .env file**:
   ```bash
   cp .env.example .env
   # Edit .env to add real API key
   ```

2. **Update .gitignore**:
   ```bash
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   ```

3. **Load dotenv in server**:
   - Add at top of `server.modular.js`:
     ```javascript
     require('dotenv').config();
     ```

4. **Start server**:
   ```bash
   npm run start:modular
   ```

---

## Data Flow & Workflows

### Workflow 1: Compare Base Images (Prerequisite)
```
User opens "Base Image Manager" tab
         ↓
App shows folder picker & current genericBaseImages/ contents
         ↓
User uploads PNG images to genericBaseImages/
         ↓
App stores images in: artist_registry_folder/genericBaseImages/
         ↓
Images are now available for selection in "Add Artist" form
         ↓
(Optionally) User can view/manage uploaded base images
```

### Workflow 2: Create New Artist with Auto-Generated Images (MAIN FEATURE)
```
User clicks "Add New Artist"
         ↓
Form displays with existing fields:
  - Artist name
  - Art style
  - Anatomy, Object, Colouring, Prompt Interpretation
         ↓
+ NEW: Shows list of available base images
         ├─ From genericBaseImages/ folder
         └─ User can select multiple (checkboxes)
         ↓
User fills out all information
         ↓
User submits form
         ↓
Backend creates artist record in registry
         ↓
Backend queues background generation job:
  FOR EACH selected base image:
    1. Extract metadata from base image
    2. Build prompt: "artist: [artist_name], [original_prompt]"
    3. Call Novel AI API /ai/generate-image
    4. Receive zip with generated PNG
    5. Save to: artist_name/with_artist/generated_*.png
    6. Save metadata JSON alongside
    7. Trigger Google Vision API analysis
    8. Trigger LPIPS analysis
    9. Import results into registry
         ↓
Backend returns jobId to frontend
         ↓
Frontend polls GET /api/generation-jobs/:jobId/status every 2 seconds
         ↓
User sees progress bar:
  "Generating image 1 of 2... (Estimated 2:30 remaining)"
         ↓
After ~2-5 min, all images complete
         ↓
Backend calculates default artist strength (hybrid LPIPS + Vision)
         ↓
Frontend detects completion and shows results:
  ├─ Generated images with thumbnails
  ├─ Analysis results for each image
  ├─ Calculated strength (e.g., 0.75 = Strong)
  ├─ Confidence % based on number of images
  └─ "View in Registry" button
         ↓
User clicks "View in Registry"
         ↓
Registry table now shows new artist with:
  ✅ Generated images
  ✅ Calculated strength
  ✅ Confidence score
  ✅ All other analysis metrics
```

### Workflow 3: Manual Upload (Existing Feature - NOT REMOVED)
```
User still has option to upload base + with_artist images manually
         ↓
This flow remains unchanged and available
         ↓
Uses existing upload UI in artist-registry component
```

---

## Request/Response Formats

### Novel AI API Request Format
**POST /ai/generate-image**

```json
{
  "input": "artist: artist_name, original prompt text here",
  "model": "nai-diffusion-3",
  "parameters": {
    "width": 832,
    "height": 1216,
    "steps": 28,
    "scale": 5.0,
    "sampler": "k_euler_ancestral",
    "seed": 1234567890,
    "n_samples": 1,
    "noise_schedule": "karras",
    "negative_prompt": "lowres, bad quality, ...",
    "cfg_rescale": 0.0,
    "legacy_v3_extend": false
  }
}
```

**Response**: HTTP 201 with zip file containing generated images

### Generation Job API Responses

**POST /api/artist-registry/generate-images** Response:
```json
{
  "success": true,
  "artistId": "artist_001",
  "artistName": "artist_name",
  "jobId": "job_abc123xyz",
  "totalImages": 2,
  "estimatedTimeMinutes": 4,
  "message": "Generation job queued"
}
```

**GET /api/generation-jobs/:jobId/status** Response:
```json
{
  "success": true,
  "jobId": "job_abc123xyz",
  "status": "generating",
  "progress": {
    "completed": 1,
    "total": 2,
    "percentage": 50
  },
  "currentImage": {
    "name": "image_2.png",
    "stage": "generating_image",
    "startedAt": "2026-04-01T15:30:00Z"
  },
  "estimatedTimeRemaining": 150,
  "estimatedCompletionTime": "2026-04-01T15:32:30Z"
}
```

**GET /api/generation-jobs/:jobId/results** Response (after completion):
```json
{
  "success": true,
  "job": {
    "jobId": "job_abc123xyz",
    "artistId": "artist_001",
    "artistName": "artist_name",
    "status": "completed",
    "completedAt": "2026-04-01T15:35:00Z",
    "totalImages": 2,
    "generatedImages": [
      {
        "sourceImage": "genericBaseImages/image_1.png",
        "generatedFile": "artist_name/with_artist/generated_abc_1.png",
        "analysisResult": {
          "strength": 0.78,
          "strengthLabel": "strong",
          "confidence": 80,
          "anatomy": 7,
          "object": 8,
          "colouring": 9,
          "promptInterpretation": 8
        }
      },
      {
        "sourceImage": "genericBaseImages/image_2.png",
        "generatedFile": "artist_name/with_artist/generated_abc_2.png",
        "analysisResult": {
          "strength": 0.72,
          "strengthLabel": "strong",
          "confidence": 80,
          "anatomy": 6,
          "object": 8,
          "colouring": 8,
          "promptInterpretation": 7
        }
      }
    ],
    "finalArtistRecord": {
      "id": "artist_001",
      "name": "artist_name",
      "strength": 0.75,
      "strengthLabel": "strong",
      "confidence": 80,
      "imagesCount": 2,
      "anatomy": 6.5,
      "object": 8,
      "colouring": 8.5,
      "promptInterpretation": 7.5
    }
  }
}
```

---

## Artist Tag Placement Rule

**CRITICAL**: Artist tag must be placed at the **TOP** of the prompt:

✅ **CORRECT**:
```
"artist: yd_(orange_maru), 1girl, masterpiece, best quality, realistic, [dynamic angle, low angle], location, heavy breathing, naughty face, official art, nsfw, classroom, uncensored, very aesthetic, no text"
```

❌ **INCORRECT** (artist tag in middle):
```
"1girl, masterpiece, best quality, artist: yd_(orange_maru), realistic, ..."
```

**Implementation**: In `NovelAiService.buildPayload()`:
```javascript
const artistTag = `artist: ${sanitizeArtistName(artistName)}`;
const prompt = artists Tag + ", " + basePrompt;
// → "artist: artist_name, original_prompt_text"
```

---

## Error Handling & Recovery

### Scenarios & Handling

| Scenario | Handling |
|----------|----------|
| API key not configured | Show error message, disable generation button |
| Image not found | Display "Image not found" error |
| Metadata extraction fails | Show error, allow manual parameter entry |
| Novel AI API timeout | Retry up to 3 times, then fail with message |
| Generation times out (>10 min) | Notify user, suggest retry |
| File save fails | Log error, notify user, suggest manual save |
| Analysis fails (Vision API) | Log warning, continue without analysis |
| Network error | Show retry button, auto-recover on reconnect |

### Logging
- Log all API requests and responses (sanitize API key)
- Log generation status at each polling interval
- Log file operations (save, analysis, errors)
- Use existing logger utility: `/server/utils/logger.js`

---

## Security Considerations

### API Key Management
✅ **DO**:
- Store API key in `.env` file (never in code)
- Load via `process.env.NOVEL_AI_API_KEY`
- Use environment variable in production (Docker, serverless, etc.)
- Add `.env` to `.gitignore`

❌ **DON'T**:
- Hardcode API key in source files
- Send API key to frontend
- Log API key in console output
- Commit `.env` file to git

### File Access
- Validate file paths to prevent directory traversal
- Ensure generated images saved to correct artist folder
- Verify folder permissions before writing

### Request Validation
- Validate imageMetadata structure before API call
- Sanitize prompt strings (though Novel AI will handle)
- Limit file sizes to prevent abuse
- Rate-limit generation requests per user if needed

---

## Testing Checklist

### Manual API Testing with cURL

Before implementing, test the Novel AI API directly. See [METADATA_TO_API_MAPPING.md](auto-image-generation/METADATA_TO_API_MAPPING.md) for a complete field comparison between the sample image metadata and the API Swagger spec.

**Available Models**:
- `nai-diffusion-4-5-full` ✅ **DEFAULT** (Latest, recommended)
- `nai-diffusion-4-5-curated` (Latest, curated)
- `nai-diffusion-4-full` (Previous generation)
- `nai-diffusion-4-curated` (Previous, curated)
- `nai-diffusion-3` (Stable legacy)
- `nai-diffusion-furry-3` (Specialized)

**Complete cURL command using JSON file** (using default model):

```bash
curl -X POST https://image.novelai.net/ai/generate-image \
  -H "Authorization: Bearer pst-1aE7y5vmMMufGP67TVIkERk4KsHtLrnpl8efGlHLSjC0qxIid01sZJD9auJXGiN1" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "artist: yd_(orange_maru), 1girl, masterpiece, best quality, realistic, [dynamic angle, low angle], location, heavy breathing, naughty face, official art, nsfw, classroom, uncensored, very aesthetic, no text",
    "model": "nai-diffusion-3",
    "parameters": {
      "width": 832,
      "height": 1216,
      "steps": 23,
      "scale": 5.0,
      "sampler": "k_euler_ancestral",
      "seed": 2546003166,
      "n_samples": 1,
      "noise_schedule": "karras"
    }
  }' \
  -o generated-image.zip
```

**Next step**: Extract and verify the ZIP contains a PNG image:
```bash
unzip -l generated-image.zip  # List contents
unzip generated-image.zip     # Extract image
```

**Key points**:
- Artist tag must be at TOP of `input` string
- Response is HTTP 201 with ZIP file containing PNG(s)
- Customize artist name and prompt as needed

---

### Backend Tests
- [ ] Novel AI service initializes with API key
- [ ] Payload building correctly removes artist tags
- [ ] Image generation request succeeds
- [ ] Status polling returns correct results
- [ ] Image file saved to correct path
- [ ] Metadata JSON created correctly
- [ ] Vision analysis triggered after save
- [ ] Error handling for invalid params
- [ ] Error handling for API failures
- [ ] Error handling for file system failures

### Frontend Tests
- [ ] Image selection and preview works
- [ ] Metadata extraction displays correctly
- [ ] Parameter form updates model
- [ ] Generation request sent with correct data
- [ ] Progress bar updates during polling
- [ ] Results display after completion
- [ ] Error messages shown on failure
- [ ] Base image generation toggle works
- [ ] Cancel button stops polling

### Integration Tests
- [ ] Full flow from image selection to analysis complete
- [ ] Image pair generation (with_artist + base)
- [ ] Artist registry updated with new images
- [ ] Thumbnails appear in registry after generation
- [ ] Confidence scores updated correctly

---

## Future Enhancements

### Short Term (Next Phase)
- [ ] Batch generation (multiple images at once)
- [ ] Generation templates (save common parameter sets)
- [ ] Advanced prompt editing UI with syntax highlighting
- [ ] Generation history/logs
- [ ] Email/notification when generation completes

### Long Term
- [ ] Webhook support for real-time completion notifications
- [ ] Custom sampler/model support
- [ ] Prompt optimization suggestions
- [ ] Generation time estimation model
- [ ] Cost tracking (if Novel AI API charges per image)
- [ ] Integration with artist registry UI (generate directly from registry)
- [ ] Mobile app support

---

## Files to Create/Modify

### New Files
- ✅ `server/services/novelAiService.js` - Novel AI API client
- ✅ `server/routes/imageGenerationRoutes.js` - HTTP endpoints
- ✅ `src/app/components/image-generator/image-generator.component.ts` - Angular component
- ✅ `src/app/components/image-generator/image-generator.component.html` - Template
- ✅ `src/app/components/image-generator/image-generator.component.scss` - Styles
- ✅ `.env` - Configuration file
- ✅ `.env.example` - Configuration template

### Files to Modify
- `server.modular.js` - Add service initialization and route mounting
- `src/app/app.component.ts` - Add navigation routing
- `src/app/app.component.html` - Add navigation link
- `package.json` - Add `dotenv` dependency if needed
- `.gitignore` - Add `.env` files

---

## Configuration Setup Instructions

### 1. Create `.env` file:
```bash
cat > .env << 'EOF'
NOVEL_AI_API_KEY=pst-1aE7y5vmMMufGP67TVIkERk4KsHtLrnpl8efGlHLSjC0qxIid01sZJD9auJXGiN1
LOG_LEVEL=INFO
EOF
```

### 2. Add to `.gitignore` (if not already there):
```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

### 3. Create `.env.example` for documentation:
```bash
cp .env .env.example
# Edit .env.example to have placeholder instead of real key
sed -i 's/=pst-.*/=your-api-key-here/' .env.example
```

### 4. Install dependencies (if needed):
```bash
npm install dotenv
```

### 5. Start the server:
```bash
npm run start:modular
```

### 6. Access the app:
```
http://localhost:4200
```

---

## Implementation Checklist

### Backend Implementation
- [ ] Create `novelAiService.js` with all methods
- [ ] Create `imageGenerationRoutes.js` with 3 endpoints
- [ ] Update `server.modular.js` imports and initialization
- [ ] Test API connectivity and error handling
- [ ] Verify .env configuration is loaded
- [ ] Test image file saving to correct folders

### Frontend Implementation
- [ ] Create `image-generator.component.ts` with all methods
- [ ] Create `image-generator.component.html` with UI sections
- [ ] Create `image-generator.component.scss` with styling
- [ ] Add component to app routing
- [ ] Add navigation link to app component
- [ ] Test metadata extraction display
- [ ] Test parameter form and validation
- [ ] Test generation polling and results display

### Configuration & Security
- [ ] Create `.env` file with API key
- [ ] Create `.env.example` template
- [ ] Update `.gitignore` to exclude `.env`
- [ ] Verify API key not logged anywhere
- [ ] Test that app works without hardcoded secrets

### Testing & Validation
- [ ] Test complete workflow from image selection to analysis
- [ ] Test error cases (invalid image, API down, etc.)
- [ ] Test base image generation (artist tag removal)
- [ ] Verify images saved to correct registry folder
- [ ] Verify analysis triggered automatically
- [ ] Check artist registry updated with new images

### Documentation
- [ ] Add comments to services and routes
- [ ] Document public method signatures
- [ ] Create user guide for Image Generator component
- [ ] Document Novel AI API parameter mapping

---

## References

- **Novel AI API**: `https://image.novelai.net/ai/generate-image` (POST)
- **Existing ImageMetadataService**: `server/services/imageMetadataService.js`
- **Existing VisionAnalysisService**: `server/services/visionAnalysisService.js`
- **Artist Registry Structure**: `.github/instructions/artist-registry.instructions.md`
- **PNG Metadata Format**: EXIF/PNG tEXt chunks (see imageMetadataService.js for parsing)

---

## Summary

This architecture provides a complete integration of Novel AI API into the application with:
- ✅ Automated metadata extraction from existing images
- ✅ Smart prompt manipulation for base/with-artist pairs
- ✅ Asynchronous generation with progress tracking
- ✅ Automatic image analysis and registry integration
- ✅ Clean separation of concerns (service → routes → component)
- ✅ Error handling and user feedback
- ✅ Security best practices for API key management
- ✅ Extensible design for future enhancements

All code follows existing project patterns and standards for maintainability and consistency.
