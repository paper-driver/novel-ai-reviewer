import { Component, OnInit, ViewChild, TemplateRef, ElementRef, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ClipboardModule } from 'ngx-clipboard';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FolderPickerService } from '../../services/folder-picker.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';
import { BaseImageManagerComponent } from '../base-image-manager/base-image-manager.component';
import { ImageGenerationProgressComponent } from '../image-generation-progress/image-generation-progress.component';
import { UrlEncodePipe } from '../../pipes/url-encode.pipe';

interface ArtistRecord {
  id: string;
  name: string;
  artStyle: string;
  strength: number;
  strengthLabel: string;
  confidence: number;
  anatomy: number;
  object: number;
  colouring: number;
  promptInterpretation: number;
  imagesCount: number;
  validationStatus: string;
  lastUpdated: string;
}

@Component({
  selector: 'app-artist-registry',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule, 
    ClipboardModule, 
    ImageViewerModalComponent,
    BaseImageManagerComponent,
    ImageGenerationProgressComponent,
    UrlEncodePipe
  ],
  templateUrl: './artist-registry.component.html',
  styleUrls: ['./artist-registry.component.scss']
})
export class ArtistRegistryComponent implements OnInit, OnDestroy {
  @ViewChild('baseImageInput') baseImageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('withArtistImageInput') withArtistImageInput!: ElementRef<HTMLInputElement>;

  artists$ = new BehaviorSubject<ArtistRecord[]>([]);
  selectedFolder$ = new BehaviorSubject<string>('');
  isLoading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');

  // Base image management
  availableBaseImages$ = new BehaviorSubject<any[]>([]);
  selectedBaseImages$ = new BehaviorSubject<string[]>([]);
  selectedUploadBaseImages$ = new BehaviorSubject<string[]>([]);
  
  // Generation job tracking
  generationJobId$ = new BehaviorSubject<string | null>(null);
  generationProgress$ = new BehaviorSubject<any | null>(null);
  generationResults$ = new BehaviorSubject<any | null>(null);
  isGenerating$ = new BehaviorSubject<boolean>(false);
  showGenerationResults$ = new BehaviorSubject<boolean>(false);
  
  private destroy$ = new Subject<void>();

  showAddForm = false;
  showUploadDialog = false;
  showEditDialog = false;
  showBaseImageManager = false;
  selectedArtist: ArtistRecord | null = null;
  showAnalysisDetails = false;
  analysisDetails: any = null;
  baseImageFileName: string = '';
  artistImageFileName: string = ''

  // Image viewer modal - using shared component
  showImageViewer = false;
  currentImageViewerData: ReviewImage | null = null;

  // Cache for artist image pair data (artistId -> imagePairs)
  private artistImagePairsCache: Map<string, any[]> = new Map();

  addArtistForm: FormGroup;
  uploadImageForm: FormGroup;
  editArtistForm: FormGroup;
  folderInput: string = '';

  artStyles = [
    { value: 'fine-art', label: 'Fine Art' },
    { value: 'semi-realistic', label: 'Semi-Realistic' },
    { value: 'realistic', label: 'Realistic' },
    { value: 'anime', label: 'Anime' },
    { value: 'cartoon', label: 'Cartoon' },
    { value: 'manga', label: 'Manga' },
    { value: 'acg', label: 'ACG' },
    { value: 'wuxia', label: 'Wuxia' },
    { value: 'cg', label: 'CG' },
    { value: 'undefined', label: 'Undefined' }
  ];

  private websocket: WebSocket | null = null;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private el: ElementRef,
    private folderPickerService: FolderPickerService
  ) {
    this.addArtistForm = this.fb.group({
      name: ['', Validators.required],
      artStyle: ['undefined'],
      anatomy: [5],
      object: [5],
      colouring: [5],
      promptInterpretation: [5],
      description: [''],
      notes: ['']
    });

    this.uploadImageForm = this.fb.group({
      baseImage: ['', Validators.required],
      withArtistImage: ['', Validators.required]
    });

    this.editArtistForm = this.fb.group({
      artStyle: ['undefined'],
      anatomy: [5],
      object: [5],
      colouring: [5],
      promptInterpretation: [5]
    });
  }

  ngOnInit() {
    // Load last used folder
    const savedFolder = localStorage.getItem('artistRegistryFolder');
    if (savedFolder) {
      this.folderInput = savedFolder;
      this.loadRegistryFromFolder();
    }

    // Connect to WebSocket for real-time validation updates
    this.connectWebSocket();
  }

  ngOnDestroy() {
    // Clean up WebSocket connection
    if (this.websocket) {
      this.websocket.close();
    }
    
    // Complete the destroy subject to unsubscribe from all observables
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Connect to WebSocket server for real-time updates
   */
  private connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3001`;

    try {
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        // WebSocket connected
      };

      this.websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'validation-complete') {
          // Reload the registry to get updated scores
          this.loadRegistryFromFolder();
          
          // Update success message
          this.successMessage$.next(
            `✅ Analysis complete for ${message.artistName}! ` +
            `LPIPS: ${(message.analysisResult.lpipsScore * 100).toFixed(1)}%, ` +
            `Vision: ${(message.analysisResult.googleVisionScore * 100).toFixed(1)}%`
          );
        } else if (message.type === 'analysis-error') {
          console.error('Analysis error:', message.message);
          this.error$.next(`Analysis failed for artist ${message.artistId}: ${message.message}`);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.websocket.onclose = () => {
        // Attempt to reconnect after 3 seconds
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
  }

  /**
   * Handle baseline image selection
   */
  onBaseImageSelected() {
    const file = this.baseImageInput?.nativeElement?.files?.[0];
    if (file) {
      this.baseImageFileName = file.name;
    }
  }

  /**
   * Handle artist image selection
   */
  onArtistImageSelected() {
    const file = this.withArtistImageInput?.nativeElement?.files?.[0];
    if (file) {
      this.artistImageFileName = file.name;
    }
  }

  /**
   * Load artist registry from user-selected folder
   */
  loadRegistryFromFolder() {
    const folderPath = this.folderInput || localStorage.getItem('artistRegistryFolder') || '';
    
    if (!folderPath) {
      this.error$.next('Please enter a folder path first');
      return;
    }
    
    // Store folder in localStorage
    localStorage.setItem('artistRegistryFolder', folderPath);
    
    this.isLoading$.next(true);
    this.error$.next('');
    this.successMessage$.next('');
    this.artistImagePairsCache.clear(); // Clear cache on new load

    this.http.get<any>('/api/artist-registry/list', {
      params: { folderPath }
    }).subscribe({
      next: (response) => {
        const artists = response.artists || [];
        this.artists$.next(artists);
        this.selectedFolder$.next(folderPath);
        // Load available base images after selectedFolder$ is set
        this.loadAvailableBaseImages();
        
        // Fetch image pair data for all artists (for thumbnails)
        artists.forEach((artist: ArtistRecord) => {
          this.http.get<any>(
            `/api/artist-registry/${artist.id}/analysis-details`,
            { params: { folderPath } }
          ).subscribe({
            next: (analysisResponse) => {
              const details = analysisResponse.details || analysisResponse;
              this.artistImagePairsCache.set(artist.id, details.imagePairs || []);
            },
            error: (error) => {
              // Silently fail for individual artist detail loads
              console.error(`Failed to load details for artist ${artist.id}:`, error);
            }
          });
        });
        
        this.isLoading$.next(false);
        this.successMessage$.next(`Loaded ${response.count} artists from registry`);
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to load registry');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Open native folder picker using FolderPickerService
   */
  async selectFolderWithPicker() {
    try {
      const selectedPath = await this.folderPickerService.pickFolder();
      if (selectedPath) {
        this.folderInput = selectedPath;
        this.loadRegistryFromFolder();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      this.error$.next('Failed to open folder picker');
    }
  }

  /**   * Load available base images from genericBaseImages folder
   */
  private loadAvailableBaseImages() {
    const folderPath = this.selectedFolder$.value;
    if (!folderPath) {
      return;
    }

    this.http.get<any>('/api/base-images/list', {
      params: { registryFolder: folderPath }
    }).subscribe({
      next: (response) => {
        if (response.success && response.images) {
          this.availableBaseImages$.next(response.images);
        }
      },
      error: (error) => {
        console.error('Failed to load base images:', error);
        this.availableBaseImages$.next([]);
      }
    });
  }

  /**
   * Toggle selection of a base image
   */
  toggleBaseImageSelection(imageName: string) {
    const currentSelection = this.selectedBaseImages$.value;
    
    if (currentSelection.includes(imageName)) {
      const newSelection = currentSelection.filter(name => name !== imageName);
      this.selectedBaseImages$.next(newSelection);
    } else {
      const newSelection = [...currentSelection, imageName];
      this.selectedBaseImages$.next(newSelection);
    }
  }

  /**
   * Toggle selection of a base image for the upload dialog
   */
  toggleUploadBaseImageSelection(imageName: string) {
    const currentSelection = this.selectedUploadBaseImages$.value;
    
    if (currentSelection.includes(imageName)) {
      const newSelection = currentSelection.filter(name => name !== imageName);
      this.selectedUploadBaseImages$.next(newSelection);
    } else {
      const newSelection = [...currentSelection, imageName];
      this.selectedUploadBaseImages$.next(newSelection);
    }
  }

  /**
   * Select all available base images for the add artist form
   */
  selectAllBaseImages() {
    const allImages = this.availableBaseImages$.value.map(img => img.name);
    this.selectedBaseImages$.next(allImages);
  }

  /**
   * Clear all base image selections for the add artist form
   */
  clearAllBaseImages() {
    this.selectedBaseImages$.next([]);
  }

  /**
   * Select all available base images for the upload dialog
   */
  selectAllUploadBaseImages() {
    const allImages = this.availableBaseImages$.value.map(img => img.name);
    this.selectedUploadBaseImages$.next(allImages);
  }

  /**
   * Clear all base image selections for the upload dialog
   */
  clearAllUploadBaseImages() {
    this.selectedUploadBaseImages$.next([]);
  }

  /**
   * Handle image load error - show placeholder
   */
  onImageLoadError(event: any) {
    event.target.style.display = 'none';
    // Parent div will show the placeholder
  }

  /**
   * Add new artist to registry with optional automatic image generation
   */
  addArtist() {
    if (!this.addArtistForm.valid) {
      return;
    }

    this.isLoading$.next(true);
    this.error$.next('');
    
    const folderPath = this.selectedFolder$.value;
    const baseFile = this.baseImageInput?.nativeElement?.files?.[0];
    const withArtistFile = this.withArtistImageInput?.nativeElement?.files?.[0];
    const selectedBaseImages = this.selectedBaseImages$.value;
    const artistName = this.addArtistForm.get('name')?.value;

    // First, create the artist record
    const formData = {
      folderPath,
      ...this.addArtistForm.value
    };

    this.http.post<any>('/api/artist-registry/add-artist', formData)
      .subscribe({
        next: (response) => {
          const artistId = response.artist.id;
          
          // Chain: Handle manual images, then handle automatic generation
          this.handlePostArtistCreation(
            artistId,
            artistName,
            folderPath,
            baseFile,
            withArtistFile,
            selectedBaseImages
          );
        },
        error: (error) => {
          this.error$.next(error.error?.message || 'Failed to add artist');
          this.isLoading$.next(false);
        }
      });
  }

  /**
   * Handle post-artist-creation workflow: upload manual images or trigger generation
   */
  private handlePostArtistCreation(
    artistId: string,
    artistName: string,
    folderPath: string,
    baseFile: File | undefined,
    withArtistFile: File | undefined,
    selectedBaseImages: string[]
  ) {
    // Step 1: Upload manual images if provided
    if (baseFile && withArtistFile) {
      const imageFormData = new FormData();
      imageFormData.append('folderPath', folderPath);
      imageFormData.append('artistName', artistName);
      imageFormData.append('artistId', artistId);
      imageFormData.append('baseImage', baseFile);
      imageFormData.append('withArtistImage', withArtistFile);

      this.http.post<any>(
        '/api/artist-registry/upload-image-pair',
        imageFormData
      ).subscribe({
        next: () => {
          // After manual upload, continue with automatic generation if base images selected
          if (selectedBaseImages.length > 0) {
            this.startImageGeneration(artistId, artistName, folderPath, selectedBaseImages);
          } else {
            this.completeArtistAddition();
          }
        },
        error: (error) => {
          this.error$.next(error.error?.message || 'Failed to upload images');
          this.isLoading$.next(false);
        }
      });
    } else if (selectedBaseImages.length > 0) {
      // Step 2: No manual images, but base images selected for automatic generation
      this.startImageGeneration(artistId, artistName, folderPath, selectedBaseImages);
    } else {
      // Step 3: No images at all, just complete the artist addition
      this.completeArtistAddition();
    }
  }

  /**
   * Trigger automatic image generation using Novel AI
   */
  private startImageGeneration(
    artistId: string,
    artistName: string,
    folderPath: string,
    selectedBaseImages: string[]
  ) {
    const generationPayload = {
      artistId,
      artistName,
      registryFolder: folderPath,
      selectedBaseImages,
      generationParams: {
        model: 'nai-diffusion-4-5-full'
      }
    };

    this.http.post<any>(
      '/api/image-generation/generate',
      generationPayload
    ).subscribe({
      next: (response) => {
        if (response.success && response.jobId) {
          this.generationJobId$.next(response.jobId);
          this.isGenerating$.next(true);
          this.isLoading$.next(false);
          
          // Start polling generation status
          this.pollGenerationStatus(response.jobId);
        } else {
          this.error$.next('Failed to start image generation');
          this.isLoading$.next(false);
        }
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to start image generation');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Poll generation job status
   */
  private pollGenerationStatus(jobId: string, pollCount = 0) {
    const maxPolls = 300; // ~10 minutes with 2-second intervals
    
    if (pollCount >= maxPolls) {
      this.error$.next('Image generation timed out');
      this.isGenerating$.next(false);
      return;
    }

    setTimeout(() => {
      this.http.get<any>(
        `/api/image-generation/status/${jobId}`
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.generationProgress$.next(response);
            
            // Check if job is complete
            if (response.status === 'completed' || response.status === 'completed_with_errors') {
              this.isGenerating$.next(false);
              this.fetchGenerationResults(jobId);
            } else if (response.status === 'failed') {
              this.isGenerating$.next(false);
              this.error$.next('Image generation failed');
            } else {
              // Continue polling
              this.pollGenerationStatus(jobId, pollCount + 1);
            }
          }
        },
        error: (error) => {
          console.error('Failed to poll generation status:', error);
          // Retry on error
          this.pollGenerationStatus(jobId, pollCount + 1);
        }
      });
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Fetch final generation results
   */
  private fetchGenerationResults(jobId: string) {
    this.http.get<any>(
      `/api/image-generation/results/${jobId}`
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        if (response.success) {
          this.generationResults$.next(response);
          this.successMessage$.next(
            `✅ Image generation complete! Generated ${response.generatedCount}/${response.totalImages} images.`
          );
        } else if (response.status === 'completed_with_errors') {
          this.generationResults$.next(response);
          const errorMsg = response.errors && response.errors.length > 0 
            ? response.errors[0] 
            : 'Generation completed with some errors';
          this.successMessage$.next(
            `⚠️ Image generation completed with ${response.generatedCount}/${response.totalImages} images. Errors: ${errorMsg}`
          );
        } else {
          this.error$.next('Image generation failed');
        }
        this.completeArtistAddition();
      },
      error: (error) => {
        this.error$.next('Failed to fetch generation results: ' + (error.error?.error || error.message));
        console.error('Generation results error:', error);
        this.completeArtistAddition();
      }
    });
  }

  /**
   * Complete the artist addition workflow
   */
  private completeArtistAddition() {
    // Show generation results view if generation was done
    if ((this.generationResults$.value) || (this.generationJobId$.value)) {
      this.showGenerationResults$.next(true);
      this.isLoading$.next(false);
    } else {
      // No generation was done, just close the form
      this.resetAddArtistForm();
      this.showAddForm = false;
      this.isLoading$.next(false);
    }

    // Also close upload dialog if generation was triggered from there
    if (this.showUploadDialog) {
      this.showUploadDialog = false;
    }

    // Reload registry in background
    this.loadRegistryFromFolder();
    this.loadAvailableBaseImages();
  }

  /**
   * Close the add artist modal
   */
  onModalClose() {
    this.resetAddArtistForm();
    this.showAddForm = false;
    this.showGenerationResults$.next(false);
    this.generationJobId$.next(null);
    this.generationResults$.next(null);
  }

  /**
   * Close the generation results view and reset form
   */
  closeGenerationResults() {
    this.resetAddArtistForm();
    this.showAddForm = false;
    this.showGenerationResults$.next(false);
    this.generationJobId$.next(null);
    this.generationResults$.next(null);
  }

  /**
   * Reset the add artist form to initial state
   */
  private resetAddArtistForm() {
    this.addArtistForm.reset({
      artStyle: 'undefined',
      anatomy: 5,
      object: 5,
      colouring: 5,
      promptInterpretation: 5
    });
    this.baseImageFileName = '';
    this.artistImageFileName = '';
    if (this.baseImageInput?.nativeElement) this.baseImageInput.nativeElement.value = '';
    if (this.withArtistImageInput?.nativeElement) this.withArtistImageInput.nativeElement.value = '';
    this.selectedBaseImages$.next([]);
  }

  /**
   * Initiate editing an artist's scoring fields
   */
  initiateEdit(artist: ArtistRecord) {
    this.selectedArtist = artist;
    this.editArtistForm.patchValue({
      artStyle: artist.artStyle,
      anatomy: artist.anatomy,
      object: artist.object,
      colouring: artist.colouring,
      promptInterpretation: artist.promptInterpretation
    });
    this.showEditDialog = true;
  }

  /**
   * Update artist scoring fields
   */
  updateArtistScoring() {
    if (!this.editArtistForm.valid || !this.selectedArtist) {
      return;
    }

    this.isLoading$.next(true);
    this.error$.next('');
    this.successMessage$.next('');

    const folderPath = this.selectedFolder$.value;
    const formData = {
      folderPath,
      ...this.editArtistForm.value
    };

    this.http.put<any>(
      `/api/artist-registry/${this.selectedArtist.id}`,
      formData
    ).subscribe({
      next: (response) => {
        // Update the artist in the list
        const artists = this.artists$.value;
        const index = artists.findIndex(a => a.id === this.selectedArtist!.id);
        if (index >= 0) {
          artists[index] = response.artist;
          this.artists$.next([...artists]);
        }

        this.successMessage$.next(`Scoring updated for ${this.selectedArtist!.name}`);
        this.showEditDialog = false;
        this.selectedArtist = null;
        this.isLoading$.next(false);
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to update artist');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Cancel editing and close dialog
   */
  cancelEdit() {
    this.showEditDialog = false;
    this.selectedArtist = null;
    this.editArtistForm.reset({
      artStyle: 'undefined',
      anatomy: 5,
      object: 5,
      colouring: 5,
      promptInterpretation: 5
    });
  }

  /**
   * Delete artist from registry
   */
  deleteArtist(artist: ArtistRecord) {
    if (!confirm(`Delete "${artist.name}" from registry? This will also delete all image files.`)) {
      return;
    }

    this.isLoading$.next(true);
    const folderPath = this.selectedFolder$.value;

    this.http.delete<any>(
      `/api/artist-registry/${artist.id}`,
      { params: { folderPath } }
    ).subscribe({
      next: () => {
        const currentArtists = this.artists$.value;
        this.artists$.next(currentArtists.filter(a => a.id !== artist.id));
        this.isLoading$.next(false);
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to delete artist');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Initiate image pair upload
   */
  initiateUpload(artist: ArtistRecord) {
    this.selectedArtist = artist;
    this.selectedUploadBaseImages$.next([]);
    this.baseImageFileName = '';
    this.artistImageFileName = '';
    if (this.baseImageInput?.nativeElement) this.baseImageInput.nativeElement.value = '';
    if (this.withArtistImageInput?.nativeElement) this.withArtistImageInput.nativeElement.value = '';
    this.showUploadDialog = true;
  }

  /**
   * Upload image pair for analysis
   */
  uploadImagePair() {
    if (!this.selectedArtist) {
      this.error$.next('No artist selected');
      return;
    }

    // Get files from input elements
    const baseFile = this.baseImageInput?.nativeElement?.files?.[0];
    const withArtistFile = this.withArtistImageInput?.nativeElement?.files?.[0];
    const selectedBaseImages = this.selectedUploadBaseImages$.value;

    // Handle two workflows:
    // 1. Direct file upload: both files must be selected
    // 2. Base image selection: generate with selected base images (no direct upload needed)
    
    if (baseFile && withArtistFile) {
      // Workflow 1: Upload image pair for analysis
      this.uploadImagePairForAnalysis(baseFile, withArtistFile);
    } else if (selectedBaseImages.length > 0) {
      // Workflow 2: Generate images with selected base images
      this.startImageGenerationFromSelectedBases();
    } else {
      this.error$.next('Please either upload image files or select base images for generation');
    }
  }

  /**
   * Upload image pair for analysis (Workflow 1)
   */
  private uploadImagePairForAnalysis(baseFile: File, withArtistFile: File) {
    this.isLoading$.next(true);
    this.error$.next('');
    this.successMessage$.next('');

    const folderPath = this.selectedFolder$.value;
    const selectedBaseImages = this.selectedUploadBaseImages$.value;
    const formData = new FormData();

    formData.append('folderPath', folderPath);
    formData.append('artistName', this.selectedArtist.name);
    formData.append('artistId', this.selectedArtist.id);
    formData.append('baseImage', baseFile);
    formData.append('withArtistImage', withArtistFile);

    this.http.post<any>(
      'http://localhost:3001/api/artist-registry/upload-image-pair',
      formData
    ).subscribe({
      next: (response) => {
        this.successMessage$.next(`Image pair uploaded. Analyzing...`);
        
        // Clear form
        this.baseImageInput.nativeElement.value = '';
        this.withArtistImageInput.nativeElement.value = '';
        this.baseImageFileName = '';
        this.artistImageFileName = '';
        
        // Handle automatic generation if base images selected - reuse generation component
        if (selectedBaseImages.length > 0 && this.selectedArtist) {
          // Keep dialog open to show generation progress
          this.startImageGeneration(
            this.selectedArtist.id,
            this.selectedArtist.name,
            folderPath,
            selectedBaseImages
          );
          this.selectedUploadBaseImages$.next([]);
        } else {
          // No generation - close dialog and let WebSocket update
          this.showUploadDialog = false;
          this.selectedArtist = null;
          this.isLoading$.next(false);
        }
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to upload image pair');
        this.isLoading$.next(false);
      }
    });
  }

  /**
   * Generate images using selected base images (Workflow 2)
   */
  private startImageGenerationFromSelectedBases() {
    const selectedBaseImages = this.selectedUploadBaseImages$.value;
    const folderPath = this.selectedFolder$.value;

    if (!selectedBaseImages.length || !this.selectedArtist) {
      this.error$.next('No base images or artist selected');
      return;
    }

    this.successMessage$.next('Starting image generation with selected base images...');
    // Keep dialog open to show generation progress

    // Start generation
    this.startImageGeneration(
      this.selectedArtist.id,
      this.selectedArtist.name,
      folderPath,
      selectedBaseImages
    );

    // Clear selections in background
    this.selectedUploadBaseImages$.next([]);
    this.selectedUploadBaseImages$.next([]);
  }

  /**
   * View analysis details for an artist
   */
  viewAnalysisDetails(artist: ArtistRecord) {
    this.selectedArtist = artist;
    this.showAnalysisDetails = true;
    this.analysisDetails = null;
    
    // Load detailed analysis
    const folderPath = this.selectedFolder$.value;
    this.http.get<any>(
      `http://localhost:3001/api/artist-registry/${artist.id}/analysis-details`,
      { params: { folderPath } }
    ).subscribe({
      next: (response) => {
        // Extract details from response (API wraps it in { success, details })
        this.analysisDetails = response.details || response;
      },
      error: (error) => {
        this.error$.next(error.error?.message || 'Failed to load analysis');
        this.showAnalysisDetails = false;
      }
    });
  }

  /**
   * View artist's with_artist images in modal viewer
   */
  viewArtistImages(artist: ArtistRecord) {
    // Fetch image pairs from analysis details
    this.http.get<any>(
      `http://localhost:3001/api/artist-registry/${artist.id}/analysis-details`,
      { params: { folderPath: this.selectedFolder$.value } }
    ).subscribe({
      next: (response) => {
        const details = response.details || response;
        const imagePairs = details.imagePairs || [];

        if (imagePairs.length === 0) {
          this.error$.next('No images uploaded for this artist yet');
          return;
        }

        // Extract only with_artist images (server now returns full paths)
        const withArtistImages = imagePairs
          .filter((pair: any) => pair.withArtistImage)
          .map((pair: any) => pair.withArtistImage);

        if (withArtistImages.length === 0) {
          this.error$.next('No artist images found');
          return;
        }

        // Create ReviewImage data for viewer
        this.currentImageViewerData = {
          images: withArtistImages, // These are already full paths from server
          folder: '', // Empty folder since images already have full paths
          apiType: 'artist-gallery',
          title: `${artist.name} - With Artist Images`,
          additionalData: {
            artistName: artist.name,
            artistId: artist.id
          }
        };

        this.showImageViewer = true;
      },
      error: (error) => {
        this.error$.next('Failed to load artist images: ' + (error.error?.message || 'Unknown error'));
      }
    });
  }

  /**
   * Get thumbnail image URL for display in table
   */
  getThumbnailUrl(artist: ArtistRecord, index: number): string {
    const folderPath = this.selectedFolder$.value;
    const imagePairs = this.artistImagePairsCache.get(artist.id);
    
    if (imagePairs && imagePairs.length > index && imagePairs[index].withArtistImage) {
      // Construct full path: folderPath/artistName/relative_path
      const imagePath = imagePairs[index].withArtistImage;
      
      // Check if path is already absolute (starts with /) or relative
      let fullPath: string;
      if (imagePath.startsWith('/')) {
        fullPath = imagePath;  // Already absolute
      } else {
        // Relative path - construct full path
        fullPath = `${folderPath}/${artist.name}/${imagePath}`;
      }
      return `/api/artist-gallery/image?filePath=${encodeURIComponent(fullPath)}`;
    }
    
    // Fallback: return empty string if no image is available yet
    return '';
  }

  /**
   * Get array of thumbnail indices to show (max 3)
   */
  getThumbnailIndices(count: number): number[] {
    const max = Math.min(count, 3);
    return Array.from({ length: max }, (_, i) => i);
  }

  /**
   * Format date string
   */
  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  /**
   * Get strength badge color
   */
  getStrengthColor(strengthLabel: string): string {
    switch (strengthLabel) {
      case 'weak':
        return 'badge-warning';
      case 'medium':
        return 'badge-info';
      case 'strong':
        return 'badge-success';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Get validation status badge
   */
  getStatusBadge(status: string): string {
    switch (status) {
      case 'pending':
        return 'badge-secondary';
      case 'analyzing':
        return 'badge-warning';
      case 'validated':
        return 'badge-success';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Clear messages
   */
  clearMessages() {
    this.error$.next('');
    this.successMessage$.next('');
  }
}
