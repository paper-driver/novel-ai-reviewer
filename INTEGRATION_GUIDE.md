# Integration & Testing Guide

## Post-Implementation Steps

After the backend and frontend code has been created, complete these steps to fully integrate the features:

### 1. Update App Routing/Navigation

Add the new components to your app routing (typically in `app.component.ts` or routing configuration):

```typescript
import { ArtistRegistryComponent } from './components/artist-registry/artist-registry.component';
import { CombinationGeneratorComponent } from './components/combination-generator/combination-generator.component';

// Add to routing configuration or navigation menu
const routes = [
  // ... existing routes
  { 
    path: 'artist-registry', 
    component: ArtistRegistryComponent,
    title: 'Artist Registry'
  },
  { 
    path: 'combination-generator', 
    component: CombinationGeneratorComponent,
    title: 'Combination Generator'
  }
];
```

### 2. Update Navigation Menu

Add links to the new components in your main navigation:

```html
<nav>
  <!-- ... existing navigation items ... -->
  <a routerLink="/artist-registry" routerLinkActive="active">
    <i class="bi bi-palette"></i> Artist Registry
  </a>
  <a routerLink="/combination-generator" routerLinkActive="active">
    <i class="bi bi-sparkles"></i> Combination Generator
  </a>
</nav>
```

### 3. Verify ngx-clipboard Installation

Ensure the clipboard library is installed (if not already):

```bash
npm install ngx-clipboard --save
```

### 4. Set Up Python Environment (for LPIPS)

For the LPIPS analysis to work, Python dependencies must be installed:

```bash
# Option 1: Pip install (for development)
pip install torch torchvision lpips pillow numpy

# Option 2: Requirements file
pip install -r requirements-ml.txt
```

Create `requirements-ml.txt` with:
```
torch>=2.0.0
torchvision>=0.15.0
lpips
pillow
numpy
```

### 5. Test the Backend Endpoints

Use curl or Postman to test the endpoints:

```bash
# Test Artist Registry List
curl "http://localhost:3001/api/artist-registry/list?folderPath=/tmp/test-registry"

# Test Add Artist
curl -X POST http://localhost:3001/api/artist-registry/add-artist \
  -H "Content-Type: application/json" \
  -d '{
    "folderPath": "/tmp/test-registry",
    "name": "test_artist",
    "artStyle": "anime"
  }'

# Test Generate Combinations
curl -X POST http://localhost:3001/api/combination-generator/generate \
  -H "Content-Type: application/json" \
  -d '{
    "folderPath": "/tmp/test-registry",
    "userInput": "I want anime style with realistic anatomy"
  }'
```

### 6. Run End-to-End Test

1. Start the server:
```bash
npm run start:modular
```

2. Start the Angular dev server:
```bash
ng serve
```

3. Navigate to http://localhost:4200
4. Click on "Artist Registry" in the navigation
5. Test adding an artist and uploading image pairs
6. Navigate to "Combination Generator"
7. Enter a description like "anime with realistic anatomy"
8. Verify combinations are generated

### 7. Troubleshooting

**Issue**: LPIPS Python script not found
- **Solution**: Ensure `server/ml/lpips_analyzer.py` exists and is executable

**Issue**: "moduleNotFoundError: No module named 'torch'"
- **Solution**: Run `pip install torch torchvision` in your Python environment

**Issue**: Image upload fails with 413 error
- **Solution**: Check Express limit settings in server.modular.js (currently set to 50MB)

**Issue**: Google Vision API returns errors
- **Solution**: Verify `google-vision-credentials.json` exists in project root

### 8. Performance Optimization

For production deployment:

1. **Caching**: Image analysis results are cached automatically
2. **Parallel Processing**: Google Vision + LPIPS run in parallel
3. **Background Jobs**: Image pair uploads use asynchronous processing
4. **Memory Management**: Python subprocess keeps LPIPS model in memory

### 9. Configuration Files Needed

Ensure these files are in place:

```
project-root/
├── google-vision-credentials.json  (Google Cloud service account)
├── package.json                     (npm dependencies)
├── server.modular.js               (Node.js server)
├── server/
│   ├── services/                   (backend services)
│   ├── routes/                     (API routes)
│   ├── ml/
│   │   └── lpips_analyzer.py      (Python sidecar)
│   └── utils/                      (utilities)
├── src/
│   └── app/
│       └── components/
│           ├── artist-registry/    (registry component)
│           └── combination-generator/  (generator component)
```

### 10. API Endpoints Reference

**Artist Registry**:
- `GET /api/artist-registry/list` - List all artists
- `POST /api/artist-registry/add-artist` - Add new artist
- `PUT /api/artist-registry/:id` - Update artist
- `DELETE /api/artist-registry/:id` - Delete artist
- `POST /api/artist-registry/upload-image-pair` - Upload images for analysis
- `GET /api/artist-registry/:id/analysis-details` - Get analysis results

**Combination Generator**:
- `POST /api/combination-generator/generate` - Generate combinations
- `POST /api/combination-generator/save-combination` - Save combination
- `GET /api/combination-generator/saved` - Get saved combinations
- `POST /api/combination-generator/format-prompt` - Format as Novel AI prompt

## Deployment Considerations

### Docker Deployment
If deploying with Docker, ensure:
- Node.js 18+ installed
- Python 3.8+ with torch/torchvision available
- Google Cloud credentials mounted

### Desktop App (Electron)
The implementation is ready for Electron:
- All file operations are local
- No external database required
- IPC ready for native folder selection

### Environment Variables
Add to `.env` if needed:
```
GOOGLE_APPLICATION_CREDENTIALS=./google-vision-credentials.json
NODE_ENV=production
PORT=3001
```

## Next Release Features (Optional)

- [ ] Image preview in upload dialog
- [ ] Batch artist import
- [ ] Combination sharing via URL
- [ ] Cloud sync for registries
- [ ] Mobile-responsive optimizations
- [ ] Dark mode support
- [ ] A/B testing integration
