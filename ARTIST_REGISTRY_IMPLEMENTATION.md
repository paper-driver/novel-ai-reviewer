# Artist Registry & Artist Combination Generator - Implementation & Architecture

## 1. Overview

This document outlines the implementation plan and architecture for two new features:
1. **Artist Registry**: Automatically measure and store artist tag strength using Google Vision API + LPIPS hybrid approach
2. **Artist Combination Generator**: Generate artist combinations based on user input using registry data with optimized emphasis weights

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Angular Frontend (src/app)                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────┐          ┌──────────────────────────┐  │
│  │ Artist Registry Component │          │ Combination Generator    │  │
│  │ (artist-registry.comp)   │          │ (combination-generator)  │  │
│  │                          │          │                          │  │
│  │ - Registry table display │          │ - Input field (NLP)      │  │
│  │ - Add/Edit artist form   │          │ - Suggestions list       │  │
│  │ - Image upload dialog    │          │ - Copy-to-clipboard      │  │
│  │ - Strength visualization │          │ - Save favorite combos   │  │
│  └──────────┬───────────────┘          └──────────┬───────────────┘  │
│             │                                      │                    │
│             │ HTTP                                 │ HTTP              │
│             ▼                                      ▼                    │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │            Artist Registry Service (Services Layer)              │ │
│  │         (artist-registry.service.ts)                            │ │
│  │                                                                  │ │
│  │  - POST /api/artist-registry/add-artist                        │ │
│  │  - GET /api/artist-registry/list                               │ │
│  │  - DELETE /api/artist-registry/{id}                            │ │
│  │  - PUT /api/artist-registry/{id}                               │ │
│  │  - POST /api/artist-registry/upload-image-pair                 │ │
│  │  - GET /api/artist-registry/{id}/analysis-details              │ │
│  └──────────┬───────────────────────────────────────────────────┬─┘ │
│             │                    │                              │    │
└─────────────┼────────────────────┼──────────────────────────────┼────┘
              │                    │                              │
              │ localhost:3001     │                              │
              ▼                    ▼                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Node.js Backend (server.modular.js)                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Artist Registry Routes Module                                   │ │
│  │  (server/routes/artistRegistryRoutes.js)                         │ │
│  │                                                                  │ │
│  │  GET    /api/artist-registry/list                              │ │
│  │  POST   /api/artist-registry/add-artist                        │ │
│  │  PUT    /api/artist-registry/{id}                              │ │
│  │  DELETE /api/artist-registry/{id}                              │ │
│  │  POST   /api/artist-registry/upload-image-pair                 │ │
│  │  GET    /api/artist-registry/{id}/analysis-details             │ │
│  │  POST   /api/artist-registry/generate-combination              │ │
│  │                                                                  │ │
│  └────────────────┬─────────────────────────────────────────────┬─┘ │
│                   │                                              │    │
│  ┌────────────────▼────────────────┐ ┌────────────────────────▼──┐  │
│  │   Artist Registry Service       │ │  Combination Generator    │  │
│  │   (artistRegistryService.js)    │ │  Service                  │  │
│  │                                 │ │  (combinationGeneratorSvc)│  │
│  │  - loadRegistry()               │ │                           │  │
│  │  - addArtist()                  │ │  - parseUserInput()       │  │
│  │  - deleteArtist()               │ │  - findMatchingArtists()  │  │
│  │  - updateArtist()               │ │  - generateCombinations() │  │
│  │  - uploadImagePair()            │ │  - calculateWeights()     │  │
│  │  - analyzeImagePair()           │ │  - rankCombinations()     │  │
│  │  - saveRegistry()               │ │                           │  │
│  └────────────────┬────────────────┘ └────────────┬──────────────┘  │
│                   │                               │                   │
│                   ▼                               │                   │
│  ┌────────────────────────────────────────────┐  │                   │
│  │    Image Analysis Layer                    │  │                   │
│  │  (imageAnalysisService.js)                 │  │                   │
│  │                                            │  │                   │
│  │  - computeLPIPS(imageA, imageB)           │  │                   │
│  │  - analyzeWithGoogleVision(image)         │  │                   │
│  │  - hybridStrengthScore(gv, lpips)        │  │                   │
│  └────────────────┬──────────────────────────┘  │                   │
│                   │                              │                   │
│                   ├─────────────────┬────────────┘                   │
│                   │                 │                                 │
│                   ▼                 ▼                                 │
│  ┌────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  LPIPS Wrapper         │  │  Google Cloud Vision API         │  │
│  │  (lpipsService.js)     │  │  (visionAnalysisService.js)      │  │
│  │                        │  │                                  │  │
│  │  - Load PyTorch model  │  │  - extractFeatures()            │  │
│  │  - computeDistance()   │  │  - compareFeaturesExisting      │  │
│  │  - cache results       │  │  - returnScores()              │  │
│  │                        │  │                                  │  │
│  └────────────────────────┘  └──────────────────────────────────┘  │
│                   │                 │                                 │
└───────────────────┼─────────────────┼─────────────────────────────────┘
                    │                 │
                    ▼                 │
          ┌──────────────────┐        │
          │  PyTorch/LPIPS   │        │
          │  (Python sidecar)│        │
          └──────────────────┘        │
                                      ▼
                        ┌──────────────────────────┐
                        │ Google Cloud Vision API  │
                        │ (External Service)       │
                        └──────────────────────────┘
```

### Local Storage Structure

```
User Selected Folder (e.g., /Users/user/Pictures/ArtistRegistry/)
├── .registry.json                    # Master registry file
├── greg_rutkowski/
│   ├── metadata.json               # Pair metadata and scores
│   ├── base/
│   │   └── image_1.jpg            # Baseline image (no artist tag)
│   └── with_artist/
│       └── image_1.jpg            # Image with artist tag
├── wlop/
│   ├── metadata.json
│   ├── base/
│   │   ├── image_1.jpg
│   │   ├── image_2.jpg
│   │   └── image_3.jpg
│   └── with_artist/
│       ├── image_1.jpg
│       ├── image_2.jpg
│       └── image_3.jpg
└── claude_monet/
    └── ...
```

## 3. Implementation Phases

### Phase 1: Backend Infrastructure (Weeks 1-2)

#### 3.1.1 Create Artist Registry Service
**File**: `server/services/artistRegistryService.js`

```typescript
class ArtistRegistryService {
  // Registry file management
  loadRegistry(folderPath)           // Load .registry.json
  saveRegistry(folderPath, data)     // Write changes to .registry.json
  initializeRegistry(folderPath)     // Create new .registry.json if missing
  
  // Artist CRUD operations
  addArtist(folderPath, artistData)
  updateArtist(folderPath, artistId, updateData)
  deleteArtist(folderPath, artistId)
  getArtist(folderPath, artistId)
  listArtists(folderPath)
  
  // Image pair management
  uploadImagePair(folderPath, artistName, baseImage, withArtistImage)
  getImagePairMetadata(folderPath, artistName, pairIndex)
  removeImagePair(folderPath, artistName, pairIndex)
  
  // Strength calculation
  calculateStrength(lpipsScore, googleVisionScore)
  updateArtistStrength(folderPath, artistId, newLpipsScore, newGvScore)
}
```

#### 3.1.2 Create Image Analysis Service
**File**: `server/services/imageAnalysisService.js`

```typescript
class ImageAnalysisService {
  // Analysis orchestration
  async analyzeImagePair(
    imagePath_A,           // Baseline image path
    imagePath_B,           // With artist tag image path
    artistName
  )
  
  // Sub-analyses (run in parallel)
  async computeLPIPS(imagePath_A, imagePath_B)
  async analyzeWithGoogleVision(imagePath_A, imagePath_B)
  
  // Hybrid scoring
  calculateHybridScore(lpipsScore, googleVisionScore)
  // Formula: (gv * 0.33) + (lpips * 0.67)
  
  // Caching
  getCachedAnalysis(imagePath_A, imagePath_B)
  cacheAnalysisResult(imagePath_A, imagePath_B, results)
}
```

#### 3.1.3 Create LPIPS Service (Node.js -> Python Sidecar)
**File**: `server/services/lpipsService.js`

Since LPIPS requires PyTorch (Python), integrate via subprocess:

```typescript
class LpipsService {
  constructor() {
    // Spawn Python process on startup
    this.pythonProcess = spawn('python3', ['server/ml/lpips_analyzer.py'])
  }
  
  async computeDistance(imagePath_A, imagePath_B) {
    // Send request to Python sidecar via IPC/stdio
    // Return LPIPS distance score (0-1)
  }
  
  async shutdown() {
    // Gracefully kill Python process on app exit
  }
}
```

**File**: `server/ml/lpips_analyzer.py`
- Loads pre-trained LPIPS model at startup
- Listens for image pair requests
- Returns LPIPS scores
- Keeps model in memory for fast processing

#### 3.1.4 Update Google Vision Service
**File**: `server/services/visionAnalysisService.js` (already exists, extend it)

```typescript
// Add to existing visionAnalysisService:
async compareImages(imagePath_A, imagePath_B) {
  // Get features for both images
  const featuresA = await this.extractFeatures(imagePath_A)
  const featuresB = await this.extractFeatures(imagePath_B)
  
  // Compute difference score (0-1)
  // Higher = more different
  return this.computeFeatureDifference(featuresA, featuresB)
}

private computeFeatureDifference(features_A, features_B) {
  // Compare: colors, objects, labels, confidence scores
  // Return weighted difference metric
}
```

#### 3.1.5 Create Artist Registry Routes
**File**: `server/routes/artistRegistryRoutes.js`

```typescript
router.get('/list', (req, res) => {
  // List all artists in registry
  // GET /api/artist-registry/list?folderPath=/path
})

router.post('/', (req, res) => {
  // Add new artist
  // POST /api/artist-registry { name, artStyle, anatomy, ... }
})

router.put('/:artistId', (req, res) => {
  // Update artist metadata (not strength - that's auto)
  // PUT /api/artist-registry/{id} { anatomy, object, ... }
})

router.delete('/:artistId', (req, res) => {
  // Delete artist from registry
  // DELETE /api/artist-registry/{id}
})

router.post('/upload-image-pair', (req, res) => {
  // Upload image pair and queue for analysis
  // POST /api/artist-registry/upload-image-pair (multipart/form-data)
  // - artistName
  // - baseImage (file)
  // - withArtistImage (file)
})

router.get('/:artistId/analysis-details', (req, res) => {
  // Get detailed analysis results for all image pairs
  // Shows individual LPIPS, GV scores, confidence
})
```

### Phase 2: Frontend Components (Weeks 2-3)

#### 3.2.1 Create Artist Registry Component
**File**: `src/app/components/artist-registry/artist-registry.component.ts`

```typescript
@Component({
  selector: 'app-artist-registry',
  templateUrl: './artist-registry.component.html',
  styleUrls: ['./artist-registry.component.scss']
})
export class ArtistRegistryComponent {
  // Data
  artists: ArtistRecord[] = []
  folderPath: string
  isLoading = false
  selectedArtist: ArtistRecord | null = null
  
  // UI States
  showAddForm = false
  showUploadDialog = false
  uploadProgress: number = 0
  analysisProgress: Map<string, { status, progress }> = new Map()
  
  constructor(
    private artistRegistry: ArtistRegistryService,
    private folderPicker: FolderPickerService
  ) {}
  
  // Folder selection
  async selectFolder() {
    this.folderPath = await this.folderPicker.pickFolder()
    await this.loadRegistry()
  }
  
  // Load registry
  async loadRegistry() {
    this.artists = await this.artistRegistry.listArtists(this.folderPath)
  }
  
  // Add artist
  async addArtist(formData) {
    await this.artistRegistry.addArtist(this.folderPath, formData)
    await this.loadRegistry()
  }
  
  // Delete artist
  async deleteArtist(artistId) {
    if (confirm('Delete this artist from registry?')) {
      await this.artistRegistry.deleteArtist(this.folderPath, artistId)
      await this.loadRegistry()
    }
  }
  
  // Upload image pair
  async uploadImagePair(artistName, baseImage, withArtistImage) {
    this.showUploadDialog = true
    this.uploadProgress = 0
    
    // Show processing notification
    this.analysisProgress.set(artistName, { status: 'uploading', progress: 0 })
    
    // Upload images
    await this.artistRegistry.uploadImagePair(
      this.folderPath,
      artistName,
      baseImage,
      withArtistImage
    )
    
    // Track analysis progress
    this.analysisProgress.set(artistName, { status: 'analyzing', progress: 50 })
    
    // Wait for analysis to complete (backend processing)
    // Poll for completion or use websocket
    await this.waitForAnalysisCompletion(artistName)
    
    this.analysisProgress.set(artistName, { status: 'complete', progress: 100 })
    await this.loadRegistry()
  }
  
  // View analysis details
  async viewAnalysisDetails(artistId) {
    const details = await this.artistRegistry.getAnalysisDetails(
      this.folderPath,
      artistId
    )
    // Show modal with all LPIPS/GV scores per pair
  }
}
```

**Template**: `artist-registry.component.html`
- Folder selector
- Registry table with columns: Name, Art Style, Strength, Confidence, Images Count, Last Updated
- Add Artist button & form
- Upload Image Pair dialog
- View Details modal showing all image pairs and their scores

#### 3.2.2 Create Combination Generator Component
**File**: `src/app/components/combination-generator/combination-generator.component.ts`

```typescript
@Component({
  selector: 'app-combination-generator',
  templateUrl: './combination-generator.component.html',
  styleUrls: ['./combination-generator.component.scss']
})
export class CombinationGeneratorComponent {
  // Input
  userInput: string = ''
  folderPath: string
  
  // Data
  artists: ArtistRecord[] = []
  suggestions: CombinationSuggestion[] = []
  savedCombinations: SavedCombination[] = []
  
  // UI States
  isGenerating = false
  selectedSuggestion: CombinationSuggestion | null = null
  
  constructor(
    private combinationGenerator: CombinationGeneratorService,
    private artistRegistry: ArtistRegistryService,
    private clipboard: NgxClipboardService
  ) {}
  
  // Set folder (from parent context)
  setFolderPath(path: string) {
    this.folderPath = path
    this.loadArtists()
    this.loadSavedCombinations()
  }
  
  // Load available artists
  async loadArtists() {
    this.artists = await this.artistRegistry.listArtists(this.folderPath)
  }
  
  // Generate suggestions
  async generateSuggestions() {
    if (!this.userInput.trim()) return
    
    this.isGenerating = true
    this.suggestions = await this.combinationGenerator.generateCombinations(
      this.userInput,
      this.artists
    )
    this.isGenerating = false
    
    // Ranked by confidence after generation
  }
  
  // Copy combination to clipboard
  copyCombination(combination: ArtistCombination) {
    const promptFrag = combination.artists
      .map(a => `${a.weight}::artist:${a.name}::`)
      .join(', ')
    
    this.clipboard.copy(promptFrag)
    // Show "Copied!" notification
  }
  
  // Save favorite combination
  async saveCombination(combination: ArtistCombination) {
    const name = prompt('Name this combination:')
    if (name) {
      await this.combinationGenerator.saveCombination(
        this.folderPath,
        { name, combination }
      )
      this.savedCombinations = await this.combinationGenerator
        .loadSavedCombinations(this.folderPath)
    }
  }
  
  // Load saved combinations
  async loadSavedCombinations() {
    this.savedCombinations = await this.combinationGenerator
      .loadSavedCombinations(this.folderPath)
  }
}
```

**Template**: `combination-generator.component.html`
- Input field for natural language description
- Suggestions list (ranked by confidence)
- Each suggestion shows:
  - Individual artists with emphasis weights
  - Full prompt format (copy-to-clipboard button)
  - Explanation of why suggested
  - Save button
- Saved combinations section

#### 3.2.3 Create Services
**File**: `src/app/services/artist-registry.service.ts`
- HTTP calls to backend endpoints
- Caching of loaded registry
- Image upload handling

**File**: `src/app/services/combination-generator.service.ts`
- Call backend generation endpoint
- Parse and format results
- Manage saved combinations (local storage)

### Phase 3: Backend AI Logic (Weeks 3-4)

#### 3.3.1 NLP Parser for User Input
**File**: `server/services/nlpParsingService.js`

```typescript
class NLPParsingService {
  // Extract attributes from user input
  parseUserInput(input: string) {
    // Returns: { 
    //   desiredAttributes: ['anatomy', 'realistic', 'fine art'],
    //   artStyle: 'realistic',
    //   preferences: { anatomy: 'high', detail: 'high' },
    //   excludeArtists: [],
    //   includeArtists: []
    // }
  }
  
  // Keyword matching
  private extractKeywords(input: string) { }
  
  // Art style detection
  private detectArtStyle(input: string) { }
  
  // Attribute scoring
  private extractAttributePreferences(input: string) { }
}
```

#### 3.3.2 Combination Generation Engine
**File**: `server/services/combinationGeneratorService.js`

```typescript
class CombinationGeneratorService {
  // Main generation entrypoint
  async generateCombinations(
    userInput: string,
    artists: ArtistRecord[]
  ): Promise<CombinationSuggestion[]> {
    
    // Parse user input
    const parsed = this.nlpParser.parseUserInput(userInput)
    
    // Find matching artists
    const candidates = this.findCandidateArtists(parsed, artists)
    
    // Generate combinations
    const combinations = this.generateCombos(candidates, parsed)
    
    // Calculate emphasis weights
    const weighted = combinations.map(combo => 
      this.calculateEmphasisWeights(combo, parsed)
    )
    
    // Rank by match quality
    const ranked = this.rankCombinations(weighted, parsed)
    
    return ranked
  }
  
  private findCandidateArtists(parsed, artists) {
    // Filter by:
    // - Art style match
    // - Attribute requirements
    // - Exclude list
    // - Include list
  }
  
  private generateCombos(candidates, parsed) {
    // Generate 2-4 artist combinations
    // Avoid redundancy (no two artists same style)
    // Balance attributes
  }
  
  private calculateEmphasisWeights(combo, parsed) {
    // For each artist in combo:
    // weight = base_user_preference * strength_adjustment_factor
    // base_user_preference: how much user wants this
    // strength_adjustment: weak=>1.4-1.6, medium=>1.0, strong=>0.7-0.9
  }
  
  private rankCombinations(combos, parsed) {
    // Score each combination by:
    // - Match quality to user input
    // - Artist synergy
    // - Attribute balance
    // Sort by confidence scores
  }
}
```

## 4. Data Models

### .registry.json Structure
```json
{
  "version": "1.0",
  "lastUpdated": "2026-04-01T12:30:00Z",
  "folder": "/Users/user/Pictures/ArtistRegistry",
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
      "averageLpips": 0.408,
      "averageGoogleVision": 0.338,
      "lastUpdated": "2026-03-28T10:15:00Z",
      "metadata": {
        "addedBy": "user",
        "description": "Digital artist known for fantasy art",
        "notes": "Consistent strong style across generations"
      }
    }
  ],
  "savedCombinations": [
    {
      "id": "combo_001",
      "name": "Anime + Realism",
      "artists": [
        { "name": "wlop", "weight": 1.1 },
        { "name": "greg_rutkowski", "weight": 0.85 }
      ],
      "prompt": "1.1::artist:wlop::, 0.85::artist:greg_rutkowski::",
      "createdAt": "2026-03-25T14:20:00Z",
      "usageCount": 3
    }
  ]
}
```

### API Request/Response Examples

#### Upload Image Pair
```
POST /api/artist-registry/upload-image-pair
Content-Type: multipart/form-data

folderPath: /Users/user/Pictures/ArtistRegistry
artistName: greg_rutkowski
baseImage: [File object]
withArtistImage: [File object]

Response 202 Accepted:
{
  "jobId": "job_abc123",
  "status": "queued",
  "estimatedTime": 15000  // ms
}
```

#### Generate Combinations
```
POST /api/artist-registry/generate-combination
Content-Type: application/json

{
  "folderPath": "/Users/user/Pictures/ArtistRegistry",
  "userInput": "I want anime style with great anatomy and detailed backgrounds",
  "maxSuggestions": 5
}

Response 200:
{
  "input": "...",
  "suggestions": [
    {
      "rank": 1,
      "confidence": 92,
      "explanation": "...",
      "artists": [
        { "name": "wlop", "weight": 1.1, "reason": "primary anime style" },
        { "name": "greg_rutkowski", "weight": 0.85, "reason": "realistic anatomy" }
      ],
      "promptFragment": "1.1::artist:wlop::, 0.85::artist:greg_rutkowski::"
    }
  ]
}
```

## 5. Integration Points

### With Existing System

1. **Folder Selection**: Reuse `FolderPickerService` (Electron IPC)
2. **Google Vision API**: Extend existing `VisionAnalysisService`
3. **Local Storage**: Use existing folder-based file system pattern from reviews/artist-gallery
4. **Navigation**: Add new route in `AppComponent` or new tab in navigation

### Database & Persistence

No database needed - all data stored in `.registry.json` at user-selected folder
- Follows existing pattern (like reviews.json for review system)
- User controls where data is stored
- Enables backup/sync to cloud storage

## 6. Dependencies & Packages

### New Backend Dependencies
```json
{
  "dependencies": {
    "lpips": "npm package for node wrapper (if available)",
    "sharp": "^0.33.0",  // Image processing (already have)
    "uuid": "^9.0.0"      // Generate artist IDs
  },
  "devDependencies": {
    "python3": "system dependency for LPIPS sidecar"
  }
}
```

### Python Dependencies (for LPIPS sidecar)
```
torch>=2.0.0
torchvision>=0.15.0
lpips (from https://github.com/richzhang/PerceptualSimilarity)
PIL/Pillow
numpy
```

### Frontend Dependencies
```typescript
// Already available in project:
// - HttpClient (HTTP requests)
// - ReactiveFormsModule (forms)
// - CommonModule (loops, conditionals)
// - ngx-clipboard (copy to clipboard - may need to add)
```

## 7. Development Workflow

### Week 1-2: Backend Foundation
1. Create `artistRegistryService.js`
2. Create `imageAnalysisService.js`
3. Create `lpipsService.js` + Python sidecar
4. Create/extend `visionAnalysisService.js`
5. Create `artistRegistryRoutes.js`
6. Write unit tests for services
7. Manual API testing

### Week 2-3: Frontend
1. Create registry component & service
2. Create combination generator component & service
3. Implement image upload UI
4. Implement results display
5. Handle loading states & errors
6. Integration testing

### Week 3-4: AI Logic
1. Implement NLP parser
2. Implement combination generation engine
3. Implement emphasis weight calculations
4. Test end-to-end flow
5. Performance optimization
6. Edge case handling

## 8. Testing Strategy

### Backend Unit Tests
- [ ] Artist CRUD operations
- [ ] Image pair upload and storage
- [ ] LPIPS computation accuracy
- [ ] Google Vision integration
- [ ] Hybrid score calculation
- [ ] Strength averaging across multiple pairs

### Integration Tests
- [ ] Full image pair analysis pipeline
- [ ] Registry persistence
- [ ] API endpoint behavior

### Frontend Unit Tests
- [ ] Component rendering
- [ ] Form validation
- [ ] Service calls (mocked backend)
- [ ] Local storage operations

### E2E Tests
- [ ] Select folder → Add artist → Upload images → See strength
- [ ] Generate combination from user input
- [ ] Save/load favorite combinations
- [ ] View strength analysis details

## 9. Performance Considerations

### Image Analysis Optimization
- Run LPIPS + Google Vision in **parallel** (not sequential)
- Cache analysis results (same image pair won't be re-analyzed)
- Use image thumbnails for preview (not full-res for analysis)
- Batch processing if user uploads multiple pairs

### Memory Management
- Don't load all images into memory at once
- Stream large images to LPIPS analyzer
- Clean up temp files after processing
- Limit concurrent analysis jobs (e.g., max 3)

### Computational Cost
- LPIPS: ~1-2 seconds per pair (GPU optional)
- Google Vision API: ~0.5-1 second per pair
- Both can run in parallel: ~2-3 seconds total per pair
- Caching dramatically reduces subsequent analysis

## 10. Error Handling & Edge Cases

### Potential Issues
1. **Bad image pairs**: Prompt mismatch between images
   - Solution: User can remove outlier pairs from detailed view
2. **Storage limits**: User runs out of disk space
   - Solution: Warn before upload, implement cleanup UI
3. **Network failure**: Google Vision API unreachable
   - Solution: Retry logic, fallback to LPIPS-only scoring
4. **Invalid user input**: Nonsense combination request
   - Solution: NLP parser sanitizes, provide UI hints
5. **Duplicate artists**: Same artist added twice
   - Solution: Check on add, merge if found

## 11. Future Enhancements

1. **Collaborative registry**: Share registry across team
2. **Web sync**: Store registry in cloud, sync between devices
3. **Artist recommendations**: Suggest artists to test based on gaps
4. **Combination templates**: Pre-built combinations for common styles
5. **A/B testing integration**: Test combinations side-by-side
6. **Model training**: Train custom model on user's test images

## 12. Success Criteria

- ✅ User can measure artist strength in <10 seconds per image pair
- ✅ Strength values match user perception (validated through feedback)
- ✅ Generate viable artist combinations from natural language input
- ✅ No performance degradation in main app
- ✅ Registry persisted and loadable across sessions
- ✅ All tests passing with >80% coverage
