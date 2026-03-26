# Client-Side Loading - API Configuration Service

## Overall Goal
Support both **local development** (different ports for frontend/backend) and **deployed** (same port) environments with a single, unified codebase using the **ApiConfigService**.

**Philosophy**: 
- **Frontend**: Identical code for all deployments
- **Services**: Use `ApiConfigService` to get dynamic API URLs
- **ApiConfigService**: Intelligently determines API base URL based on environment
  - Local: Returns `http://localhost:{serverPort}` (configured port)
  - Deployed: Returns `window.location.origin` (same origin as frontend)
- **Result**: Same codebase works for desktop, web, and containerized deployments

## API Configuration Service Architecture

### Environment Detection Strategy

**Local Development (Frontend on 4200, Backend on 3000)**
```
Frontend (http://localhost:4200)
         ↓
    ApiConfigService
         ↓
    Checks: window.__API_CONFIG__.localHostPort
         ↓
    Returns: http://localhost:3000/api/*
         ↓
    Backend API (http://localhost:3000)
```

**Deployed Environment (Frontend and Backend on same origin)**
```
Frontend (https://app.example.com)
         ↓
    ApiConfigService
         ↓
    window.__API_CONFIG__ is undefined
         ↓
    Returns: window.location.origin (https://app.example.com/api/*)
         ↓
    Backend API (https://app.example.com/api/*)
```

### Configuration Injection

**In `src/index.html` (Local Development)**
```html
<script>
  // For local development: Frontend on 4200, Backend on 3000
  // In production, comment out or remove this line
  window.__API_CONFIG__ = { localHostPort: 3000 };
</script>
```

**For Production Deployment**
- Leave `window.__API_CONFIG__` unset or empty
- Frontend and backend serve from same origin
- ApiConfigService automatically uses `window.location.origin`

### ApiConfigService Implementation

**File**: `src/app/services/api-config.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = this.resolveApiBaseUrl();
  }

  private resolveApiBaseUrl(): string {
    const config = (window as any).__API_CONFIG__;
    
    if (config && config.localHostPort) {
      // Local development: explicit port configuration
      return `${window.location.protocol}//${window.location.hostname}:${config.localHostPort}`;
    }
    
    // Deployed: same origin as frontend
    return window.location.origin;
  }

  getBaseUrl(): string {
    return this.apiBaseUrl;
  }

  getApiUrl(endpoint: string): string {
    const apiPath = endpoint.startsWith('/api') ? endpoint : `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    return `${this.apiBaseUrl}${apiPath}`;
  }

  buildUrl(endpoint: string, queryString: string = ''): string {
    const apiPath = endpoint.startsWith('/api') ? endpoint : `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    return `${this.apiBaseUrl}${apiPath}${queryString}`;
  }
}
```

## Services Updated with ApiConfigService

All services now use `ApiConfigService` instead of hardcoded `http://localhost:3000`:

### Example: ArtistGalleryService

**Before:**
```typescript
loadArtistGroups(folderPath: string): Observable<ArtistGalleryResult> {
  return this.http.post<ArtistGalleryResult>(
    'http://localhost:3000/api/artist-gallery/load-groups',
    { folderPath }
  );
}
```

**After:**
```typescript
@Injectable({ providedIn: 'root' })
export class ArtistGalleryService {
  constructor(private http: HttpClient, private apiConfig: ApiConfigService) {}

  loadArtistGroups(folderPath: string): Observable<ArtistGalleryResult> {
    return this.http.post<ArtistGalleryResult>(
      this.apiConfig.getApiUrl('/artist-gallery/load-groups'),
      { folderPath }
    );
  }

  getThumbnailUrl(folderPath: string, filename: string): string {
    const fullFilePath = `${folderPath}/${filename}`;
    return this.apiConfig.buildUrl('/artist-gallery/image', 
      `?filePath=${encodeURIComponent(fullFilePath)}&thumbnail=true&v=v2`);
  }
}
```

### Services Updated
- ✅ artist-gallery.service.ts
- ✅ prompt-grouping.service.ts
- ✅ review.service.ts
- ✅ illustration-quality.service.ts
- ✅ batch-rating.service.ts
- ✅ ai-feedback.service.ts
- ✅ folder-picker.service.ts
- ✅ reviews-folder.service.ts

### Components Updated
- ✅ image-viewer-modal.component.ts
- ✅ reviews-table.component.ts
- ✅ floating-stats.component.ts
- ✅ ai-corrections-widget.component.ts

## Environment Files

### Development Environment (`src/environments/environment.ts`)
```typescript
export const environment = {
  production: false,
  apiConfig: {
    localHostPort: 3000,
    baseUrl: 'http://localhost:3000'
  }
};
```

### Production Environment (`src/environments/environment.prod.ts`)
```typescript
export const environment = {
  production: true,
  apiConfig: {
    baseUrl: '' // Not used, will be determined at runtime
  }
};
```

## Deployment Scenarios

### **Scenario 1: Local Development**
```
Frontend: http://localhost:4200 (ng serve)
Backend:  http://localhost:3000 (npm run start:modular)

window.__API_CONFIG__ = { localHostPort: 3000 }
ApiConfigService → http://localhost:3000
```

### **Scenario 2: Production Web Deployment (Docker)**
```
Request arrives at:  https://app.example.com
Nginx routes /api → backend service
Nginx routes /* → frontend (Angular)

window.__API_CONFIG__ is undefined
ApiConfigService → window.location.origin (https://app.example.com)
Backend endpoints: https://app.example.com/api/*
```

### **Scenario 3: Raspberry Pi / Portainer Container**
```
Container IP: 192.168.1.100
Port mapping: 3000:3000 (internal:external)

Browser accesses: http://192.168.1.100:3000
Frontend served from: http://192.168.1.100:3000
Backend API: http://192.168.1.100:3000/api/*

ApiConfigService → window.location.origin (http://192.168.1.100:3000)
```

## Configuration for Different Environments

### **Local Development Setup**

1. **Enable local host configuration** in `src/index.html`:
```html
<script>
  window.__API_CONFIG__ = { localHostPort: 3000 };
</script>
```

2. **Start backend**: `npm run start:modular`
   - Runs on http://localhost:3000

3. **Start frontend**: `ng serve`
   - Runs on http://localhost:4200

4. **ApiConfigService** automatically uses:
   - Frontend calls to: http://localhost:3000/api/*

### **Production Build Deployment**

1. **Comment out or remove** the local config from `src/index.html`
2. **Build for production**: `npm run build`
3. **Deploy with Docker**: `docker-compose up` or `./deploy.sh start`
4. **Access at**: https://app.example.com (or IP:port)
5. **ApiConfigService** automatically uses:
   - Frontend calls to: https://app.example.com/api/* (same origin)

### **Docker/Portainer Setup**

Uses same configuration as production:
- No local port override needed
- Container serves everything on single port (e.g., 3000)
- Nginx/reverse proxy routes `/api` to backend, `/*` to frontend
- ApiConfigService uses `window.location.origin`

## HTTP Interceptor for Web Deployment (Future Enhancement)

While `ApiConfigService` handles API URL routing, an optional HTTP Interceptor can add:
- Automatic client-side file operations detection
- Transparent fallback from API to File System Access API for web
- Unified request/response handling across deployments

**When needed**: Only if implementing pure-web version where server cannot access client files.

**Typically not needed** because:
- Local development: Server has file access
- Docker deployment: Container has shared volume access
- Web deployment: Can upload files to server first

## Summary of Changes

| Component | Change | Benefit |
|-----------|--------|---------|
| ApiConfigService | Created | Dynamic API URL resolution |
| 8 Services | Updated | Use ApiConfigService instead of hardcoded URLs |
| 4 Components | Updated | Use ApiConfigService for image/data URLs |
| src/index.html | Modified | Added configuration injection |
| src/environments/ | Created | Environment-specific configurations |

## Testing the Configuration

### Local Development Test
```bash
# Terminal 1: Backend
npm run start:modular
# Should start on http://localhost:3000

# Terminal 2: Frontend
ng serve
# Should start on http://localhost:4200

# Browser: http://localhost:4200
# ApiConfigService should resolve to http://localhost:3000
# Check Network tab: All /api/* calls go to localhost:3000 ✅
```

### Production Build Test
```bash
# Build
npm run build

# Comment out window.__API_CONFIG__ in src/index.html

# Start server (Angular configured to dist/)
node server.modular.js

# Access at http://localhost:3000
# ApiConfigService should resolve to http://localhost:3000
# Check Network tab: All /api/* calls go to localhost:3000 ✅
```

### Docker Test
```bash
# Build and run
docker-compose up --build

# Access at http://localhost:3000
# ApiConfigService should resolve to http://localhost:3000
# Check Network tab: All /api/* calls are relative or use origin ✅
```

## Debugging

### Verify ApiConfigService Resolution

Add to any component's ngOnInit:
```typescript
constructor(private apiConfig: ApiConfigService) {}

ngOnInit() {
  console.log('API Base URL:', this.apiConfig.getBaseUrl());
  console.log('Sample API URL:', this.apiConfig.getApiUrl('/ratings/load'));
}
```

### Check Configuration

In browser console:
```javascript
console.log(window.__API_CONFIG__);
// Local: { localHostPort: 3000 }
// Production: undefined
```

### Network Inspection

**Local Development:**
- Frontend: localhost:4200
- API calls: localhost:3000/api/*

**Production:**
- Frontend & API: Same origin
- API calls: /api/* (relative) or https://app.example.com/api/*
      this.groups = result.groups;
      // For desktop: result comes from API
      // For web: result comes from interceptor's client-side call
      // Component doesn't care which!
    });
}
```

### Services: Keep Exactly As-Is
```typescript
// Services are COMPLETELY UNCHANGED!
// No modifications needed - they just make API calls

@Injectable()
export class ArtistGalleryService {
  constructor(private http: HttpClient) {}
  
  // Keep all existing API methods
  loadArtistGroups(path: string): Observable<ArtistGalleryResult> {
    return this.http.get<ArtistGalleryResult>(
      `${this.apiBaseUrl}/artist-gallery/groups?folderPath=${path}`
    );
  }
  
  loadRatings(path: string): Observable<RatingsResponse> {
    return this.http.get<RatingsResponse>(
      `${this.apiBaseUrl}/ratings/load?folderPath=${path}`
    );
  }
  
  saveRatings(path: string, ratings: any): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/ratings/save`, {
      folderPath: path,
      ratings
    });
  }
  
  // NO NEW METHODS NEEDED - Interceptor handles everything!
}
```

**Why no changes to services?**
- Services just make HTTP calls
- HTTP Interceptor intercepts these calls
- Interceptor converts to client-side if needed
- Services remain blissfully unaware of deployment mode


## File Structure for Client-Side Storage
All data files should be stored at the **root** of the folder user selects:

### Structure 1: Artist Gallery (Sorted Image Folders)
```
user_selected_folder/
├── _artist_mapping.json         ← Artist/group metadata
├── .image-ratings.json          ← All image ratings (shared by all features)
├── folder1/                     ← Artist/group folder
│   ├── image1.png
│   ├── image2.png
│   └── ...
└── folder2/                     ← Another artist/group folder
    ├── image1.png
    └── ...
```

### Structure 2: Prompt Grouping WITH Sub-folders
```
user_selected_folder/
├── .prompt-mapping.json         ← Prompt group metadata
├── .image-ratings.json          ← All image ratings
├── group_1/                     ← Prompt group folder
│   ├── image1.png
│   ├── image2.png
│   └── ...
└── group_2/                     ← Another prompt group folder
    ├── image1.png
    └── ...
```

### Structure 3: Prompt Grouping WITHOUT Sub-folders (Flat Structure)
```
user_selected_folder/
├── .prompt-mapping.json         ← Prompt group metadata
├── .image-ratings.json          ← All image ratings
├── image1.png                   ← Images directly in root (single flat group)
├── image2.png
└── ...
```

### Structure 4: Review Table
```
user_selected_folder/
├── .reviews.json                ← Review data (linked to artist-gallery or prompt-grouping)
├── .image-ratings.json          ← All image ratings (shared)
├── _artist_mapping.json         ← (if used with artist-gallery)
└── ... (image folders as above)
```

**Data Files:**
- `_artist_mapping.json` - Artist gallery metadata (for artist-gallery feature)
- `.prompt-mapping.json` - Prompt group metadata (for prompt-grouping feature)
- `.image-ratings.json` - Flat structure: `{ "filename.png": 8, "another.png": 6 }` (shared across all features)
- `.reviews.json` - Array of review objects (for reviews table feature)

## What Needs to Change

### Minimal Changes Required:

1. **Create DeploymentConfigService** (new, ~20 lines)
   - Detects deployment mode (web vs desktop)
   - Provides `isWeb()` and `isDesktop()` methods

2. **Create FileOperationInterceptor** (new, ~300 lines)
   - Intercepts file-operation API calls
   - For desktop: Passes through normally (no change)
   - For web: Uses ClientFileSystemService to perform operations
   - Returns results in same format as API

3. **Register in app.module.ts** (3 lines)
   - Add `DeploymentConfigService` to providers
   - Add `FileOperationInterceptor` to HTTP_INTERCEPTORS

### Everything Else: ZERO CHANGES
- ✅ All services remain exactly as-is (still make normal API calls)
- ✅ All components remain exactly as-is (still call services normally)
- ✅ All templates remain exactly as-is
- ✅ ClientFileSystemService already exists with required methods
- ✅ FileSystemHandleService already exists
- ✅ FolderPickerService already works

## HTTP Interceptor Implementation

### 6. **Components: artist-gallery & prompt-grouping** (Simple - Unchanged)
**Components remain simple - just call services normally**

```typescript
// Components don't change - they just call the service methods
// For desktop: API call goes through to server normally
// For web: HTTP Interceptor converts to client-side call automatically
// Component doesn't know the difference!

loadGroups(): void {
  // This code is IDENTICAL for both deployments
  this.galleryService.loadArtistGroups(this.sortedFolderPath)
    .subscribe(
      result => {
        this.groups = result.groups;
        this.baseFolder = result.baseFolder;
        this.refreshAverageRatings();
      },
      error => {
        console.error('Error loading groups:', error);
        this.error = 'Failed to load groups';
      }
    );
}

refreshAverageRatings(): void {
  // Simple - just call the service method
  // Interceptor handles the rest
  this.galleryService.loadRatings(this.baseFolder)
    .subscribe(
      response => {
        if (response.success) {
          this.updateGroupAverageRatings(response.ratings);
        }
      },
      error => console.warn('Error loading ratings:', error)
    );
}

closeImageViewer(): void {
  // Ratings save - simple service call
  // Interceptor handles client-side vs API
  const mergedRatings = { ...existing, ...newRatings };
  this.galleryService.saveRatings(this.baseFolder, mergedRatings)
    .subscribe(
      () => {
        this.ratingsStateService.notifyRatingsSaved(this.baseFolder, mergedRatings);
        this.refreshAverageRatings();
      },
      error => console.error('Error saving ratings:', error)
    );
}
```

**Key insight: NO CHANGES TO COMPONENTS**
- ✅ Desktop deployment: Code works as-is (API calls pass through)
- ✅ Web deployment: Interceptor converts API calls to client-side
- ✅ Components remain functional and unchanged

**Ratings loading pattern (Simple):**
```typescript
// No conditional logic needed
// Just call the service - interceptor handles the rest
refreshAverageRatings(): void {
  this.galleryService.loadRatings(this.baseFolder)
    .subscribe(
      response => {
        if (response.success) {
          this.updateGroupAverageRatings(response.ratings);
        }
      },
      error => console.warn('Error loading ratings:', error)
    );
}
```

**Ratings saving pattern (Simple, merge happens in service):**
```typescript
closeImageViewer(): void {
  // Merge ratings at service level
  const mergedRatings = { ...this.existingRatings, ...this.newRatings };
  
  // Simple save call - let service/interceptor handle the details
  this.galleryService.saveRatings(this.baseFolder, mergedRatings)
    .subscribe(
      () => {
        this.ratingsStateService.notifyRatingsSaved(
          this.baseFolder,
          mergedRatings
        );
        this.refreshAverageRatings();
      },
      error => console.error('Error saving ratings:', error)
    );
}
```

### 7. **image-viewer-modal.component.ts** (Simple - Unchanged)
**Modal remains simple - uses API URLs as before**

```typescript
// Modal code stays EXACTLY as it is now
// Just uses HTTP service calls for everything
// Interceptor handles switching to client-side in web mode

updateCurrentImage(): void {
  const apiType = this.reviewData?.apiType || 'reviews';
  
  // Standard API URL construction - unchanged
  const fullPath = `${this.reviewData.folder}/${this.currentImageName}`;
  const endpoint = apiType === 'artist-gallery' ? 'artist-gallery' : 'prompt-grouping';
  
  this.currentImageUrl = this.apiConfig.getApiUrl(endpoint + '/image')
    + `?filePath=${encodeURIComponent(fullPath)}`;
  
  this.fetchImageMetadata();
}

fetchImageMetadata(): void {
  const apiType = this.reviewData?.apiType || 'reviews';
  
  // Standard metadata fetching - unchanged
  const metadataUrl = this.buildMetadataUrl();
  fetch(metadataUrl)
    .then(response => response.json())
    .then(data => {
      this.prompt = data.prompt || data.originalPrompt;
      this.artists = data.artists || [];
    })
    .catch(err => console.error('Error fetching metadata:', err));
}
```

**Key insight: ZERO CHANGES TO MODAL COMPONENT**
- ✅ For desktop: API URLs work normally
- ✅ For web deployment: Images loaded as data URLs via interceptor
- ✅ Component doesn't need to know the difference

## How It Works

### The Flow:
1. **Component makes API call:** `this.galleryService.loadRatings(path)`
2. **HTTP Interceptor intercepts call:**
   - Desktop mode: Passes through to API (server handles it)
   - Web mode: Intercepts and uses ClientFileSystemService (client handles it)
3. **Component receives response:** Same format either way, component doesn't know the difference

### Example: Rating Component (ZERO CHANGES)
```typescript
// This code works identically for BOTH deployments!
loadRatings(): void {
  this.galleryService.loadRatings(this.folderPath)
    .subscribe(result => {
      // Desktop: result from API server
      // Web: result from interceptor's client-side call
      // Component doesn't care!
      this.updateRatings(result.ratings);
    });
}
```

### Key Insight:
**Frontend code never changes. Interceptor handles all deployment differences.**

## Common Patterns

### Pattern 1: How Different Endpoints Are Handled

```typescript
// In file-operation.interceptor.ts

// RATINGS LOAD - Read .image-ratings.json
if (url.includes('/ratings/load')) {
  return this.handleRatingsLoad(handle);  // Uses clientFS.readJsonFile()
}

// RATINGS SAVE - Merge and write to .image-ratings.json
if (url.includes('/ratings/save')) {
  return this.handleRatingsSave(handle, req.body);  // Uses clientFS.writeJsonFile()
}

// ARTIST GALLERY GROUPS - List folders, load metadata
if (url.includes('/artist-gallery/groups')) {
  return this.handleLoadArtistGroups(handle);
}

// IMAGE LOAD - Read image as data URL
if (url.includes('/image')) {
  return this.handleLoadImage(handle, params);  // Uses clientFS.readImageAsDataUrl()
}
```

### Pattern 2: Merge and Save Pattern (Used by Interceptor)

```typescript
private handleRatingsSave(handle, requestBody): Observable {
  return from(
    // 1. Load existing
    this.clientFS.readJsonFile(handle, '.image-ratings.json')
      .then(existing => existing || {})
      .catch(() => ({}))
      // 2. Merge
      .then(existing => {
        const merged = { ...existing, ...requestBody.ratings };
        // 3. Save
        return this.clientFS.writeJsonFile(handle, '.image-ratings.json', merged);
      })
      .then(success => ({ success }))
      .catch(err => ({ success: false, message: err.message }))
  ).pipe(
    map(body => new HttpResponse({ status: 200, body } as any))
  );
}
```

### Pattern 3: List and Images Pattern

```typescript
private async loadArtistGroupsFromHandle(handle): Promise<any> {
  const groups: any[] = [];
  // 1. List directories
  const directories = await this.clientFS.listDirectories(handle);

  for (const dirName of directories) {
    // 2. Get directory handle
    const dirHandle = await handle.getDirectoryHandle(dirName);
    // 3. List image files
    const files = await this.clientFS.listFiles(dirHandle);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

    // 4. Pre-load thumbnail
    let thumbnailDataUrl = '';
    try {
      thumbnailDataUrl = await this.clientFS.readImageAsDataUrl(
        dirHandle,
        imageFiles[0]
      );
    } catch (err) {
      console.warn(`Failed to load thumbnail for ${dirName}`, err);
    }

    groups.push({
      name: dirName,
      numberOfImages: imageFiles.length,
      thumbnailDataUrl,
      images: imageFiles
    });
  }

  return { success: true, groups, totalImages: ... };
}
```

## Testing Checklist

### Desktop Mode Tests (DeploymentConfigService.isDesktop() = true)
- [ ] Interceptor present but passes API calls through (no interception)
- [ ] All API calls hit the server normally
- [ ] Ratings load/save work via API
- [ ] Groups load work via API
- [ ] Images load via API
- [ ] 100% backward compatible with current implementation

### Web Mode Tests (DeploymentConfigService.isWeb() = true)
- [ ] Interceptor active and intercepts file-operation calls
- [ ] Select folder via browser picker → Groups load from file system
- [ ] Groups endpoint intercepted → Uses loadArtistGroupsFromHandle logic
- [ ] Ratings load endpoint intercepted → Reads .image-ratings.json
- [ ] Ratings save endpoint intercepted → Merges and writes .image-ratings.json
- [ ] Image load endpoint intercepted → Returns data URL
- [ ] Reviews load endpoint intercepted → Reads .reviews.json
- [ ] Reviews save endpoint intercepted → Writes .reviews.json
- [ ] NO API calls made for file operations in web mode

### Interceptor Routing Tests
- [ ] /ratings/load → Intercepts (web mode)
- [ ] /ratings/save → Intercepts (web mode)
- [ ] /artist-gallery/groups → Intercepts (web mode)
- [ ] /prompt-grouping/groups → Intercepts (web mode)
- [ ] /image → Intercepts (web mode)
- [ ] /reviews/load → Intercepts (web mode)
- [ ] /reviews/save → Intercepts (web mode)
- [ ] Non-file-operation endpoints → Pass through (both modes)

### Client-Side File System Tests
- [ ] readJsonFile works
- [ ] writeJsonFile works (creates file if doesn't exist)
- [ ] readImageAsDataUrl works
- [ ] listDirectories works
- [ ] listFiles works
- [ ] Merge logic: existing + new ratings merged correctly

### Error Cases
- [ ] No folder selected in web mode → Returns 400 error
- [ ] Browser doesn't support File System Access API → Show error
- [ ] User denies folder permission → Show error
- [ ] Folder deleted after selection → Handle gracefully
- [ ] Missing .image-ratings.json on first load → Creates empty {}
- [ ] Corrupted JSON file → Try to read, handle error
- [ ] Large file read → Doesn't freeze UI
- [ ] Rapid folder changes → Handles state correctly

### Cross-Browser Tests
- [ ] Desktop mode: Works in all browsers (uses API)
- [ ] Web mode + Chrome/Edge: Works (has File System Access API)
- [ ] Web mode + Firefox/Safari: Shows clear error (no API support)

## HTTP Interceptor Implementation

The HTTP interceptor is where ALL the deployment-specific logic goes. It:
1. Detects file-operation API calls
2. For desktop: Passes through to API normally
3. For web: Uses ClientFileSystemService to perform operations directly
4. Returns results in same format as API

**Complete Interceptor Implementation:**

```typescript
// file-operation.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse
} from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

@Injectable()
export class FileOperationInterceptor implements HttpInterceptor {
  constructor(
    private deploymentConfig: DeploymentConfigService,
    private fileSystemHandleService: FileSystemHandleService,
    private clientFS: ClientFileSystemService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Only intercept for WEB deployment
    if (this.deploymentConfig.isWeb()) {
      // Only intercept file-operation endpoints
      if (this.isFileOperationRequest(req)) {
        return this.handleFileOperationClientSide(req);
      }
    }

    // For desktop deployment or non-file-operation requests, pass through normally
    return next.handle(req);
  }

  private isFileOperationRequest(req: HttpRequest<any>): boolean {
    const url = req.url.toLowerCase();
    return (
      url.includes('/ratings/load') ||
      url.includes('/ratings/save') ||
      url.includes('/artist-gallery/groups') ||
      url.includes('/artist-gallery/image') ||
      url.includes('/prompt-grouping/groups') ||
      url.includes('/prompt-grouping/image') ||
      url.includes('/reviews/load') ||
      url.includes('/reviews/save')
    );
  }

  private handleFileOperationClientSide(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    const url = req.url.toLowerCase();
    const handle = this.fileSystemHandleService.getHandle();

    if (!handle) {
      // No handle available in web mode
      return of(
        new HttpResponse({
          status: 400,
          statusText: 'No folder selected',
          body: { success: false, error: 'Web mode requires folder selection' }
        })
      );
    }

    // Route based on endpoint
    if (url.includes('/ratings/load')) {
      return this.handleRatingsLoad(handle);
    }

    if (url.includes('/ratings/save')) {
      return this.handleRatingsSave(handle, req.body);
    }

    if (url.includes('/artist-gallery/groups')) {
      return this.handleLoadArtistGroups(handle);
    }

    if (url.includes('/artist-gallery/image')) {
      return this.handleLoadImage(handle, req.params);
    }

    if (url.includes('/prompt-grouping/groups')) {
      return this.handleLoadPromptGroups(handle);
    }

    if (url.includes('/prompt-grouping/image')) {
      return this.handleLoadImage(handle, req.params);
    }

    if (url.includes('/reviews/load')) {
      return this.handleReviewsLoad(handle);
    }

    if (url.includes('/reviews/save')) {
      return this.handleReviewsSave(handle, req.body);
    }

    // Pass through if not handled
    return next.handle(req);
  }

  private handleRatingsLoad(handle: FileSystemDirectoryHandle): Observable<HttpEvent<any>> {
    return from(
      this.clientFS.readJsonFile(handle, '.image-ratings.json')
        .then(ratings => ({ success: true, ratings }))
        .catch(err => {
          console.warn('Error loading ratings from file:', err);
          return { success: false, ratings: {} };
        })
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any))
    );
  }

  private handleRatingsSave(
    handle: FileSystemDirectoryHandle,
    requestBody: any
  ): Observable<HttpEvent<any>> {
    return from(
      this.clientFS.readJsonFile(handle, '.image-ratings.json')
        .then(existing => existing || {})
        .catch(() => ({}))
        .then(existing => {
          // Merge existing + new ratings
          const merged = { ...existing, ...requestBody.ratings };
          return this.clientFS.writeJsonFile(handle, '.image-ratings.json', merged);
        })
        .then(success => ({ success, message: 'Ratings saved' }))
        .catch(err => {
          console.error('Error saving ratings:', err);
          return { success: false, message: err.message };
        })
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any))
    );
  }

  private handleLoadArtistGroups(handle: FileSystemDirectoryHandle): Observable<HttpEvent<any>> {
    return from(
      this.loadArtistGroupsFromHandle(handle)
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any)),
      catchError(err => of(
        new HttpResponse({
          status: 500,
          body: { success: false, error: err.message }
        } as any)
      ))
    );
  }

  private async loadArtistGroupsFromHandle(
    handle: FileSystemDirectoryHandle
  ): Promise<any> {
    const groups: any[] = [];
    const directories = await this.clientFS.listDirectories(handle);

    for (const dirName of directories) {
      const dirHandle = await handle.getDirectoryHandle(dirName);
      const files = await this.clientFS.listFiles(dirHandle);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

      if (imageFiles.length > 0) {
        // Pre-load first image as thumbnail
        let thumbnailDataUrl = '';
        try {
          thumbnailDataUrl = await this.clientFS.readImageAsDataUrl(
            dirHandle,
            imageFiles[0]
          );
        } catch (err) {
          console.warn(`Failed to load thumbnail for ${dirName}`, err);
        }

        groups.push({
          name: dirName,
          numberOfImages: imageFiles.length,
          path: dirName,
          thumbnailDataUrl,
          images: imageFiles
        });
      }
    }

    return {
      success: true,
      groups,
      totalImages: groups.reduce((sum, g) => sum + g.numberOfImages, 0),
      baseFolder: 'local'
    };
  }

  private handleLoadPromptGroups(handle: FileSystemDirectoryHandle): Observable<HttpEvent<any>> {
    return from(
      this.loadPromptGroupsFromHandle(handle)
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any)),
      catchError(err => of(
        new HttpResponse({
          status: 500,
          body: { success: false, error: err.message }
        } as any)
      ))
    );
  }

  private async loadPromptGroupsFromHandle(
    handle: FileSystemDirectoryHandle
  ): Promise<any> {
    const groups: any[] = [];
    const directories = await this.clientFS.listDirectories(handle);

    // Check for both folder structure and flat structure
    if (directories.length > 0) {
      // Folder structure (multiple groups)
      for (const dirName of directories) {
        const dirHandle = await handle.getDirectoryHandle(dirName);
        const files = await this.clientFS.listFiles(dirHandle);
        const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

        if (imageFiles.length > 0) {
          let thumbnailDataUrl = '';
          try {
            thumbnailDataUrl = await this.clientFS.readImageAsDataUrl(
              dirHandle,
              imageFiles[0]
            );
          } catch (err) {
            console.warn(`Failed to load thumbnail for ${dirName}`, err);
          }

          groups.push({
            id: dirName,
            name: dirName,
            numberOfImages: imageFiles.length,
            path: dirName,
            thumbnailDataUrl,
            images: imageFiles
          });
        }
      }
    } else {
      // Flat structure (images in root)
      const files = await this.clientFS.listFiles(handle);
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

      if (imageFiles.length > 0) {
        let thumbnailDataUrl = '';
        try {
          thumbnailDataUrl = await this.clientFS.readImageAsDataUrl(handle, imageFiles[0]);
        } catch (err) {
          console.warn('Failed to load thumbnail for flat structure', err);
        }

        groups.push({
          id: 'root',
          name: 'Root',
          numberOfImages: imageFiles.length,
          path: '.',
          thumbnailDataUrl,
          images: imageFiles
        });
      }
    }

    return {
      success: true,
      groups,
      totalImages: groups.reduce((sum, g) => sum + g.numberOfImages, 0)
    };
  }

  private handleLoadImage(
    handle: FileSystemDirectoryHandle,
    params: any
  ): Observable<HttpEvent<any>> {
    const filePath = params.get('filePath');
    if (!filePath) {
      return of(
        new HttpResponse({
          status: 400,
          body: { error: 'Missing filePath parameter' }
        } as any)
      );
    }

    return from(
      this.clientFS.readImageAsDataUrl(handle, filePath)
        .then(dataUrl => ({ dataUrl }))
        .catch(err => {
          console.error('Error loading image:', err);
          throw err;
        })
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any)),
      catchError(err => of(
        new HttpResponse({
          status: 404,
          body: { error: 'Image not found: ' + filePath }
        } as any)
      ))
    );
  }

  private handleReviewsLoad(handle: FileSystemDirectoryHandle): Observable<HttpEvent<any>> {
    return from(
      this.clientFS.readJsonFile(handle, '.reviews.json')
        .then(reviews => ({ success: true, reviews: reviews || [] }))
        .catch(err => {
          console.warn('Error loading reviews from file:', err);
          return { success: false, reviews: [] };
        })
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any))
    );
  }

  private handleReviewsSave(
    handle: FileSystemDirectoryHandle,
    requestBody: any
  ): Observable<HttpEvent<any>> {
    return from(
      this.clientFS.writeJsonFile(handle, '.reviews.json', requestBody.reviews)
        .then(success => ({ success, message: 'Reviews saved' }))
        .catch(err => {
          console.error('Error saving reviews:', err);
          return { success: false, message: err.message };
        })
    ).pipe(
      map(body => new HttpResponse({ status: 200, body } as any))
    );
  }
}
```

**Deployment Configuration Service:**

```typescript
// deployment-config.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DeploymentConfigService {
  private deploymentMode: 'desktop' | 'web' = 'desktop';

  constructor() {
    // Load from environment or window config
    this.deploymentMode = (window as any).__APP_CONFIG__?.mode || 'desktop';
  }

  isWeb(): boolean {
    return this.deploymentMode === 'web';
  }

  isDesktop(): boolean {
    return this.deploymentMode === 'desktop';
  }
}
```

**Register interceptor in app.module.ts:**
```typescript
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { FileOperationInterceptor } from './interceptors/file-operation.interceptor';
import { DeploymentConfigService } from './services/deployment-config.service';

@NgModule({
  providers: [
    DeploymentConfigService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: FileOperationInterceptor,
      multi: true
    }
  ]
})
export class AppModule { }
```

**Build-time configuration (optional):**
```typescript
// environment.ts (desktop)
export const environment = {
  deploymentMode: 'desktop'
};

// environment.web.ts (web)
export const environment = {
  deploymentMode: 'web'
};
```

**Or runtime configuration in index.html:**
```html
<script>
  // Set deployment mode at runtime
  window.__APP_CONFIG__ = {
    mode: 'web'  // or 'desktop'
  };
</script>
```

## Debugging Aids

**Enable Logging in Interceptor:**
```typescript
// Add to file-operation.interceptor.ts intercept() method
intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  console.log('[Interceptor] Mode:', this.deploymentConfig.isWeb() ? 'WEB' : 'DESKTOP');
  console.log('[Interceptor] Request:', req.url);

  if (this.deploymentConfig.isWeb()) {
    if (this.isFileOperationRequest(req)) {
      console.log('[Interceptor] INTERCEPTING FILE OPERATION:', req.url);
      return this.handleFileOperationClientSide(req);
    }
    console.log('[Interceptor] Passing through (not a file operation)');
  }

  return next.handle(req);
}
```

**Check Network Tab (F12):**
- **Desktop mode**: All HTTP requests visible (ratings, groups, images, etc.)
- **Web mode**: File-operation requests NOT in network tab (intercepted)
- **Web mode**: Non-file endpoints still appear in network tab

**Check Deployment Config:**
```typescript
// In browser console:
console.log(
  'Deployment Mode:',
  ng.probe(document.querySelector('app-root')).injector.get(
    ng.coreTokens.Injector
  ).get(DeploymentConfigService).isWeb() ? 'WEB' : 'DESKTOP'
);
```

**Verify FileSystemHandle Status:**
```typescript
// In browser console:
const handleService = ng.probe(document.querySelector('app-root')).injector.get(
  ng.coreTokens.Injector
).get(FileSystemHandleService);
console.log('Handle present:', !!handleService.getHandle());
console.log('Handle path:', handleService.getPath());
```

**Check ClientFileSystemService:**
```typescript
// Verify the service has required methods:
// ✅ readJsonFile<T>(handle, filePath): Promise<T>
// ✅ writeJsonFile<T>(handle, filePath, data): Promise<boolean>
// ✅ readImageAsDataUrl(handle, filePath): Promise<string>
// ✅ listFiles(handle, folderPath): Promise<string[]>
// ✅ listDirectories(handle): Promise<string[]>
```

## Implementation Checklist

### Step 1: Add Deployment Config Service ✓
```typescript
// src/app/services/deployment-config.service.ts
- Create DeploymentConfigService
- Add isWeb() and isDesktop() methods
- Load mode from environment or window config
```

### Step 2: Add HTTP Interceptor ✓
```typescript
// src/app/interceptors/file-operation.interceptor.ts
- Create FileOperationInterceptor
- Implement handlers for each endpoint (ratings, groups, images, reviews)
- Use ClientFileSystemService for file operations
- Return HttpResponse in same format as API
```

### Step 3: Register in Module ✓
```typescript
// app.module.ts
- Import DeploymentConfigService
- Import FileOperationInterceptor
- Add both to providers
- Add FileOperationInterceptor to HTTP_INTERCEPTORS
```

### Step 4: Set Deployment Mode ✓
Choose one:
- Build-time: Set in environment.ts
- Runtime: Set window.__APP_CONFIG__.mode
- Default: 'desktop' (backward compatible)

### Step 5: Test ✓
- Desktop mode: All API calls work normally (no interceptor changes)
- Web mode: File operations use client-side (no API calls)
- Components: Zero changes needed, work in both modes

## Success Criteria

### For Desktop Deployment
1. ✅ HTTP Interceptor present but inactive (allows pass-through)
2. ✅ All API calls work normally
3. ✅ Server handles file operations
4. ✅ 100% backward compatible

### For Web Deployment
1. ✅ HTTP Interceptor active (intercepts file operations)
2. ✅ File operations use ClientFileSystemService
3. ✅ No API calls for ratings/groups/images
4. ✅ Components work identically to desktop
5. ✅ User must select folder via browser picker (one-time)
6. ✅ Data persists in .image-ratings.json, .reviews.json, etc.
7. ✅ Complete offline functionality

### Architecture Quality
1. ✅ Zero changes to services
2. ✅ Zero changes to components
3. ✅ Zero changes to templates
4. ✅ Single responsibility: Interceptor handles deployment logic
5. ✅ Easy to test (mock DeploymentConfigService)
6. ✅ Follows Angular best practices (interceptor pattern)
7. ✅ Minimal code additions (~300 lines total)
