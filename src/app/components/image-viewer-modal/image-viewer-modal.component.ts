import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ViewChild, ElementRef, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { IllustrationQualityService, IllustrationQualityScore } from '../../services/illustration-quality.service';
import { BatchRatingService } from '../../services/batch-rating.service';
import { AiFeedbackModalComponent } from '../ai-feedback-modal/ai-feedback-modal.component';
import { AiFeedbackService } from '../../services/ai-feedback.service';

export interface ReviewImage {
  images: string[];
  folder: string;
  prompt?: string;
  review?: string;
  // For artist gallery support
  artists?: string[];
  title?: string; // Used for artist tag display instead of prompt
  // API type: 'reviews', 'artist-gallery', or 'prompt-grouping'
  apiType?: 'reviews' | 'artist-gallery' | 'prompt-grouping';
  // Additional data for specific API types
  additionalData?: any;
  // Image ratings: filename -> rating (0-10)
  imageRatings?: { [filename: string]: number };
}

@Component({
  selector: 'app-image-viewer-modal',
  standalone: true,
  imports: [CommonModule, HttpClientModule, AiFeedbackModalComponent],
  templateUrl: './image-viewer-modal.component.html',
  styleUrls: ['./image-viewer-modal.component.scss']
})
export class ImageViewerModalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isOpen: boolean = false;
  @Input() reviewData: ReviewImage | null = null;
  @Output() closeModal = new EventEmitter<void>();
  @Output() ratingsChanged = new EventEmitter<{ [filename: string]: number }>();
  @ViewChild('imageElement') imageElement: ElementRef<HTMLImageElement> | null = null;
  @ViewChild('thumbnailStrip') thumbnailStrip: ElementRef<HTMLDivElement> | null = null;

  currentImageIndex: number = 0;
  currentImageUrl: string = '';
  currentImageName: string = '';
  imageWidth: number = 0;
  imageHeight: number = 0;
  imageSizeKB: number = 0;
  
  // Image loading state
  isImageLoading: boolean = false;
  
  // Rating system (0-10)
  currentImageRating: number = 0; // 0 means no rating
  imageRatings: { [filename: string]: number } = {};
  // Track if ratings have been modified during this modal session
  ratingsModified: boolean = false;
  
  zoomLevel: number = 100;
  minZoom: number = 50;
  maxZoom: number = 300;
  zoomStep: number = 25;
  
  // Pan properties
  panX: number = 0;
  panY: number = 0;
  isDragging: boolean = false;
  dragStartX: number = 0;
  dragStartY: number = 0;
  dragOffsetX: number = 0;
  dragOffsetY: number = 0;
  
  // Sidebar toggle
  showSidebar: boolean = true;
  
  // Metadata
  prompt: string = '';
  artists: string[] = [];
  openFinderError: string = '';
  
  // AI Rating
  isAutoRating: boolean = false;
  autoRatingMessage: string = '';
  illustrationAnalysis: IllustrationQualityScore | null = null;

  // Feedback System
  showFeedbackModal: boolean = false;

  // Thumbnail URL cache - memoize to prevent constant re-renders
  private thumbnailUrlCache: Map<string, string> = new Map();

  constructor(
    private http: HttpClient,
    private illustrationQualityService: IllustrationQualityService,
    private batchRatingService: BatchRatingService,
    private aiFeedbackService: AiFeedbackService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.updateCurrentImage();
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  ngOnChanges() {
    if (this.isOpen && this.reviewData) {
      // Clear thumbnail URL cache when new review data is loaded
      this.thumbnailUrlCache.clear();
      
      this.currentImageIndex = 0;
      this.zoomLevel = 100;
      this.resetPan();
      this.prompt = this.reviewData.prompt || '';
      // Reset the ratings modified flag when opening modal
      this.ratingsModified = false;
      // Merge ratings from reviewData with existing ratings to preserve local changes
      if (this.reviewData.imageRatings) {
        this.imageRatings = { ...this.imageRatings, ...this.reviewData.imageRatings };
      }
      this.updateCurrentImage();
    }
  }

  /**
   * Handle keyboard events for navigation and controls
   * Arrow Right / Arrow Down: Next image
   * Arrow Left / Arrow Up: Previous image
   * Escape: Close modal
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Only handle keyboard when modal is open
    if (!this.isOpen) {
      return;
    }

    console.log(`[ImageViewer] Key pressed: ${event.key}`);

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.nextImage();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.prevImage();
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  updateCurrentImage() {
    if (this.reviewData && this.reviewData.images.length > 0) {
      const fileName = this.reviewData.images[this.currentImageIndex];
      this.currentImageName = fileName;
      
      // For ratings, we need to use just the basename (filename only) for cross-feature compatibility
      // This ensures ratings are the same whether accessed via prompt-grouping or artist-gallery
      const fileBasename = fileName.includes('/') ? fileName.split('/').pop()! : fileName;
      
      // Load rating for current image - try both full path and basename
      this.currentImageRating = this.imageRatings[fileBasename] || this.imageRatings[fileName] || 0;
      console.log(`[ImageViewer] updateCurrentImage - Loading rating:`);
      console.log(`  - fileName: ${fileName}`);
      console.log(`  - fileBasename: ${fileBasename}`);
      console.log(`  - imageRatings[fileBasename]: ${this.imageRatings[fileBasename]}`);
      console.log(`  - imageRatings[fileName]: ${this.imageRatings[fileName]}`);
      console.log(`  - Final currentImageRating: ${this.currentImageRating}`);
      console.log(`  - Full imageRatings object:`, this.imageRatings);
      
      // Clear previous metadata and AI analysis when switching images
      this.prompt = '';
      this.artists = [];
      this.illustrationAnalysis = null;
      
      // Reset zoom and pan for new image
      this.zoomLevel = 100;
      this.resetPan();
      
      // Build image URL based on API type
      const apiType = this.reviewData.apiType || 'reviews';
      console.log(`[ImageViewer] Updating current image to: ${fileName}, basename: ${fileBasename}, apiType: ${apiType}`);
      
      // Start loading indicator
      this.isImageLoading = true;
      
      if (apiType === 'artist-gallery' || apiType === 'prompt-grouping') {
        // For artist-gallery and prompt-grouping: use the respective endpoints with encoded file path
        const fullFilePath = `${this.reviewData.folder}/${fileName}`;
        const endpoint = apiType === 'artist-gallery' ? 'artist-gallery' : 'prompt-grouping';
        this.currentImageUrl = `http://localhost:3000/api/${endpoint}/image?filePath=${encodeURIComponent(fullFilePath)}`;
      } else {
        // For reviews: use the standard images endpoint
        this.currentImageUrl = `http://localhost:3000/api/images/${this.reviewData.folder}/${fileName}`;
      }
      
      console.log(`[ImageViewer] Image URL: ${this.currentImageUrl}`);
      
      // Trigger change detection to ensure template bindings are updated
      this.cdr.detectChanges();
      
      // Auto-scroll thumbnail strip to keep active thumbnail visible
      this.scrollThumbnailIntoView();
      
      // Fetch image metadata
      this.fetchImageMetadata();
    }
  }

  /**
   * Scroll the thumbnail strip to ensure the active thumbnail is visible
   */
  private scrollThumbnailIntoView(): void {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      if (this.thumbnailStrip) {
        const strip = this.thumbnailStrip.nativeElement;
        
        // Always scroll to show the first thumbnail on initial load
        // This ensures we see thumbnails from index 0
        if (this.currentImageIndex === 0) {
          strip.scrollLeft = 0;
          console.log(`[ImageViewer] Set thumbnail strip scrollLeft to 0 for first image`);
          return;
        }
        
        // For other images, try to center them (but not aggressively)
        const wrappers = strip.querySelectorAll('.thumbnail-wrapper');
        if (wrappers && wrappers.length > this.currentImageIndex) {
          const activeThumbnailWrapper = wrappers[this.currentImageIndex] as HTMLElement;
          const thumbnailLeft = activeThumbnailWrapper.offsetLeft;
          const thumbnailWidth = activeThumbnailWrapper.offsetWidth;
          const stripWidth = strip.clientWidth;
          const currentScroll = strip.scrollLeft;
          
          // Only scroll if the thumbnail is not visible
          const thumbnailRight = thumbnailLeft + thumbnailWidth;
          const visibleRight = currentScroll + stripWidth;
          
          if (thumbnailLeft < currentScroll) {
            // Thumbnail is to the left, scroll left to show it
            strip.scrollLeft = Math.max(0, thumbnailLeft - 10);
            console.log(`[ImageViewer] Scrolled left to show thumbnail ${this.currentImageIndex + 1}`);
          } else if (thumbnailRight > visibleRight) {
            // Thumbnail is to the right, scroll right to show it
            strip.scrollLeft = thumbnailRight - stripWidth + 10;
            console.log(`[ImageViewer] Scrolled right to show thumbnail ${this.currentImageIndex + 1}`);
          }
        }
      }
    }, 50);
  }

  /**
   * Fetch image dimensions and size metadata
   */
  fetchImageMetadata() {
    // Reset dimensions
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.imageSizeKB = 0;
    
    const currentUrl = this.currentImageUrl; // Capture current URL to handle rapid navigation
    
    const img = new Image();
    img.onload = () => {
      // Only update if this is still the current image (prevents race conditions)
      if (this.currentImageUrl === currentUrl) {
        this.imageWidth = img.naturalWidth;
        this.imageHeight = img.naturalHeight;
        this.isImageLoading = false;
        console.log(`[ImageViewer] Image loaded successfully: ${this.imageWidth}x${this.imageHeight}`);
      }
    };
    img.onerror = () => {
      console.error(`[ImageViewer] Failed to load image: ${currentUrl}`);
      if (this.currentImageUrl === currentUrl) {
        this.isImageLoading = false;
      }
    };
    img.src = this.currentImageUrl;
    
    // Fetch file size
    fetch(this.currentImageUrl)
      .then(response => response.blob())
      .then(blob => {
        if (this.currentImageUrl === currentUrl) {
          this.imageSizeKB = Math.round(blob.size / 1024);
          console.log(`[ImageViewer] Image size: ${this.imageSizeKB} KB`);
        }
      })
      .catch(err => console.error('[ImageViewer] Error fetching image metadata:', err));
    
    // Extract actual generation prompt from image metadata
    if (this.reviewData && this.reviewData.folder && this.currentImageName) {
      const apiType = this.reviewData.apiType || 'reviews';
      let metadataUrl: string;
      
      if (apiType === 'artist-gallery' || apiType === 'prompt-grouping') {
        // For artist-gallery and prompt-grouping: use respective endpoints with encoded file path
        const fullFilePath = `${this.reviewData.folder}/${this.currentImageName}`;
        const endpoint = apiType === 'artist-gallery' ? 'artist-gallery' : 'prompt-grouping';
        metadataUrl = `http://localhost:3000/api/${endpoint}/image-metadata?filePath=${encodeURIComponent(fullFilePath)}`;
      } else {
        // For reviews: use standard endpoint
        metadataUrl = `http://localhost:3000/api/image-metadata/${this.reviewData.folder}/${this.currentImageName}`;
      }
      
      console.log(`[ImageViewer] Fetching metadata from: ${metadataUrl}`);
      
      fetch(metadataUrl)
        .then(response => {
          if (!response.ok) {
            console.warn(`[ImageViewer] Metadata fetch returned ${response.status}: ${response.statusText}`);
            return Promise.reject(new Error(`HTTP ${response.status}`));
          }
          return response.json();
        })
        .then(data => {
          // Only process if still the current image
          if (this.currentImageUrl === currentUrl) {
            console.log(`[ImageViewer] Metadata response:`, data);
            // Support both 'prompt' and 'originalPrompt' fields
            if (data.prompt) {
              this.prompt = data.prompt;
              console.log('Prompt extracted:', this.prompt.substring(0, 100) + '...');
            } else if (data.originalPrompt) {
              this.prompt = data.originalPrompt;
              console.log('Original prompt extracted:', this.prompt.substring(0, 100) + '...');
            } else {
              console.warn('No prompt in metadata:', data);
            }
            
            // Extract artist tags if available
            if (data.artists && Array.isArray(data.artists)) {
              this.artists = data.artists;
              console.log('Artists extracted:', this.artists);
            } else {
              this.artists = [];
            }
          }
        })
        .catch(err => console.error('Error extracting image prompt:', err));
    }
  }

  zoomIn() {
    if (this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
    }
  }

  zoomOut() {
    if (this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
    }
  }

  resetZoom() {
    this.zoomLevel = 100;
    this.resetPan();
  }

  resetPan() {
    this.panX = 0;
    this.panY = 0;
  }

  /**
   * Handle mouse wheel zoom and thumbnail scroll
   * Vertical scroll on image = zoom in/out
   * Horizontal scroll on thumbnail strip = scroll thumbnails naturally
   * Shift+Scroll on image = scroll thumbnail strip
   */
  onMouseWheel(event: WheelEvent) {
    const target = event.target as HTMLElement;
    const isOnThumbnailStrip = target.closest('.thumbnail-strip') !== null;
    
    // If directly on thumbnail strip, allow natural scrolling (don't prevent)
    if (isOnThumbnailStrip) {
      console.log(`[ImageViewer] Natural scroll on thumbnail strip`);
      return;
    }
    
    // If Shift+Scroll on image area, scroll thumbnail strip manually
    if (event.shiftKey && this.thumbnailStrip) {
      event.preventDefault();
      const strip = this.thumbnailStrip.nativeElement;
      strip.scrollLeft += event.deltaY > 0 ? 50 : -50;
      console.log(`[ImageViewer] Shift+Scroll on image, thumbnail scrollLeft: ${strip.scrollLeft}`);
      return;
    }
    
    // Otherwise, handle vertical scroll as zoom on the main image
    event.preventDefault();
    
    // Scroll up = zoom in, scroll down = zoom out
    const direction = event.deltaY > 0 ? -1 : 1;
    const newZoom = this.zoomLevel + direction * this.zoomStep;
    
    if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
      this.zoomLevel = newZoom;
      console.log(`[ImageViewer] Zoom on image: ${this.zoomLevel}%`);
    }
  }

  /**
   * Handle wheel scroll on thumbnail strip - prevent bubbling to image viewer
   */
  onThumbnailWheel(event: WheelEvent): void {
    // Stop the event from bubbling up to the modal-body handler
    event.stopPropagation();
    // Let the browser handle the scroll naturally on the thumbnail strip
    console.log(`[ImageViewer] Thumbnail strip wheel - stopped propagation`);
  }

  /**
   * Handle mouse down for pan drag (only on image, not on thumbnail strip)
   */
  onMouseDown(event: MouseEvent) {
    // Don't drag if clicking on thumbnail strip or buttons
    const target = event.target as HTMLElement;
    if (target.closest('.thumbnail-strip') || target.closest('button')) {
      return;
    }
    
    if (this.zoomLevel > 100) {
      event.preventDefault();
      this.isDragging = true;
      this.dragStartX = event.clientX - this.dragOffsetX;
      this.dragStartY = event.clientY - this.dragOffsetY;
    }
  }

  /**
   * Handle mouse move for pan drag
   */
  onMouseMove(event: MouseEvent) {
    if (this.isDragging && this.zoomLevel > 100) {
      event.preventDefault();
      this.dragOffsetX = event.clientX - this.dragStartX;
      this.dragOffsetY = event.clientY - this.dragStartY;
      
      // Constrain pan to reasonable limits based on zoom level
      // Allow more panning when zoomed in more
      const zoomFactor = this.zoomLevel / 100;
      const maxPanX = Math.max(150, 200 * (zoomFactor - 1));
      const maxPanY = Math.max(150, 200 * (zoomFactor - 1));
      
      this.dragOffsetX = Math.max(-maxPanX, Math.min(maxPanX, this.dragOffsetX));
      this.dragOffsetY = Math.max(-maxPanY, Math.min(maxPanY, this.dragOffsetY));
    }
  }

  /**
   * Handle mouse up for pan drag
   */
  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.panX = this.dragOffsetX;
      this.panY = this.dragOffsetY;
    }
  }

  nextImage() {
    if (this.reviewData && this.currentImageIndex < this.reviewData.images.length - 1) {
      this.currentImageIndex++;
      this.resetPan();
      this.updateCurrentImage();
      this.cdr.detectChanges();
    }
  }

  prevImage() {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.resetPan();
      this.updateCurrentImage();
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle thumbnail click - sets the index and updates the displayed image
   */
  onThumbnailClick(index: number): void {
    console.log(`[ImageViewer] Thumbnail clicked: index ${index}`);
    this.currentImageIndex = index;
    this.resetPan();
    // Call updateCurrentImage directly to ensure it uses the updated index
    this.updateCurrentImage();
    // Force change detection to ensure the image URL is updated in the template
    this.cdr.detectChanges();
    console.log(`[ImageViewer] After thumbnail click - currentImageUrl: ${this.currentImageUrl}`);
  }

  getThumbnailUrl(image: string): string {
    if (!this.reviewData) return '';
    
    // Check cache first - prevents repeated URL generation
    if (this.thumbnailUrlCache.has(image)) {
      return this.thumbnailUrlCache.get(image) || '';
    }
    
    const apiType = this.reviewData.apiType || 'reviews';
    let url: string;
    if (apiType === 'artist-gallery' || apiType === 'prompt-grouping') {
      // For artist-gallery and prompt-grouping: use respective endpoints with encoded file path
      const fullFilePath = `${this.reviewData.folder}/${image}`;
      const endpoint = apiType === 'artist-gallery' ? 'artist-gallery' : 'prompt-grouping';
      url = `http://localhost:3000/api/${endpoint}/image?filePath=${encodeURIComponent(fullFilePath)}`;
    } else {
      // For reviews: use the standard images endpoint
      url = `http://localhost:3000/api/images/${this.reviewData.folder}/${image}`;
    }
    
    // Cache the URL so it doesn't change on subsequent renders
    this.thumbnailUrlCache.set(image, url);
    console.log(`[ImageViewer] getThumbnailUrl for ${image}: ${url}`);
    return url;
  }

  /**
   * Handle thumbnail image load errors
   */
  onThumbnailError(event: Event, index: number): void {
    const img = event.target as HTMLImageElement;
    console.warn(`[ImageViewer] Failed to load thumbnail ${index + 1}: ${img.src}`);
    // Optionally set a placeholder image or add error styling
    img.style.opacity = '0.5';
  }

  /**
   * Handle thumbnail image load success
   */
  onThumbnailLoad(event: Event, index: number): void {
    const img = event.target as HTMLImageElement;
    console.log(`[ImageViewer] Loaded thumbnail ${index + 1} successfully`);
    // Ensure opacity is 1 after loading
    img.style.opacity = '1';
  }

  /**
   * Set rating for current image (0-10)
   */
  setRating(rating: number): void {
    console.log(`[Modal] setRating called with: ${rating}`);
    console.log(`[Modal] Current image: ${this.currentImageName}`);
    
    if (rating < 0) rating = 0;
    if (rating > 10) rating = 10;
    
    // Extract just the basename for rating storage (for cross-feature compatibility)
    const fileBasename = this.currentImageName.includes('/') 
      ? this.currentImageName.split('/').pop()! 
      : this.currentImageName;
    
    this.currentImageRating = rating;
    this.imageRatings[fileBasename] = rating;  // Store using basename only
    this.ratingsModified = true;  // Mark that ratings have changed
    
    console.log(`[Modal] After setRating:`);
    console.log(`  - currentImageRating: ${this.currentImageRating}`);
    console.log(`  - Full path: ${this.currentImageName}`);
    console.log(`  - Basename: ${fileBasename}`);
    console.log(`  - imageRatings[${fileBasename}]: ${this.imageRatings[fileBasename]}`);
    console.log(`  - Full imageRatings:`, this.imageRatings);
    
    // Update reviewData if it exists
    if (this.reviewData) {
      if (!this.reviewData.imageRatings) {
        this.reviewData.imageRatings = {};
      }
      this.reviewData.imageRatings[fileBasename] = rating;  // Store using basename only
      console.log(`[Modal] reviewData.imageRatings updated:`, this.reviewData.imageRatings);
    }
  }

  /**
   * Clear rating for current image
   */
  clearRating(): void {
    // Extract basename for consistency
    const fileBasename = this.currentImageName.includes('/') 
      ? this.currentImageName.split('/').pop()! 
      : this.currentImageName;
    
    this.currentImageRating = 0;
    delete this.imageRatings[fileBasename];
    if (this.reviewData && this.reviewData.imageRatings) {
      delete this.reviewData.imageRatings[fileBasename];
    }
    this.ratingsModified = true;  // Mark that ratings have changed
    console.log(`[ImageViewer] Cleared rating for ${this.currentImageName} (basename: ${fileBasename})`);
  }

  /**
   * Get all ratings for external use (for calculating group averages)
   */
  getRatings(): { [filename: string]: number } {
    return this.imageRatings;
  }

  /**
   * Auto-rate current illustration using Google Cloud Vision AI
   */
  async autoRateCurrentIllustration(): Promise<void> {
    if (!this.reviewData) {
      console.error('[ImageViewer] No review data available');
      return;
    }

    const startTime = Date.now();
    this.isAutoRating = true;
    this.autoRatingMessage = '🤖 Analyzing illustration with AI...';

    try {
      const fullFilePath = `${this.reviewData.folder}/${this.currentImageName}`;
      console.log(`[ImageViewer] Starting AI analysis for: ${fullFilePath}`);

      const analysis = await this.illustrationQualityService.analyzeIllustration(fullFilePath).toPromise();

      if (!analysis) {
        throw new Error('No analysis returned');
      }

      this.illustrationAnalysis = analysis;
      const rating = Math.round(analysis.overallScore);
      this.setRating(rating);

      const elapsed = (Date.now() - startTime) / 1000;
      this.autoRatingMessage = `✅ ${rating}/10 - ${analysis.analysis}`;
      console.log(`[ImageViewer] AI analysis complete in ${elapsed.toFixed(1)}s:`, analysis);

      setTimeout(() => {
        this.autoRatingMessage = '';
      }, 4000);

    } catch (err) {
      this.autoRatingMessage = `❌ Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[ImageViewer] AI analysis error:', err);
    } finally {
      this.isAutoRating = false;
    }
  }

  /**
   * Batch auto-rate all illustrations in group using AI
   */
  async autoRateAllIllustrationsWithAI(): Promise<void> {
    if (!this.reviewData || this.reviewData.images.length === 0) {
      console.error('[ImageViewer] No images to analyze');
      return;
    }

    const totalImages = this.reviewData.images.length;
    console.log(`[ImageViewer] 🚀 Starting batch AI analysis of ${totalImages} images`);
    console.log(`[ImageViewer] ⏱️ Estimated time: ${Math.round(totalImages * 0.8 / 60)}-${Math.round(totalImages * 1.0 / 60)} minutes`);
    console.log(`[ImageViewer] 💰 Estimated cost: $${(totalImages * 0.0015).toFixed(2)} (after free tier)`);

    const filePaths = this.reviewData.images.map(img => `${this.reviewData!.folder}/${img}`);

    this.isAutoRating = true;
    this.autoRatingMessage = '📋 Submitting batch job to AI service...';

    try {
      // Submit batch job
      // Pass the folder as sourcePath - backend will search up the directory tree for .ai-feedback.json
      const jobResponse = await this.batchRatingService.submitBatchRatingJob(
        this.reviewData.folder,
        this.reviewData.images,
        this.reviewData.folder  // Backend will auto-detect feedback file location
      ).toPromise();

      if (!jobResponse) {
        throw new Error('No job response');
      }

      const jobId = jobResponse.jobId;
      console.log(`[ImageViewer] Batch job submitted! Job ID: ${jobId}`);
      console.log(`[ImageViewer] Estimated time: ${jobResponse.estimatedTime}`);

      this.autoRatingMessage = `📊 Batch job submitted (ID: ${jobId}). Processing in background...`;

      // Poll for progress
      this.batchRatingService.pollBatchProgress(jobId, 5000).subscribe({
        next: (progress) => {
          this.autoRatingMessage = `⏳ Processing: ${progress.processedImages}/${progress.totalImages} (${progress.percentComplete}%) - ETA: ${progress.estimatedTimeRemaining}s`;
        },
        complete: () => {
          console.log(`[ImageViewer] Batch job completed!`);
          
          // Fetch and apply results
          this.batchRatingService.getBatchResults(jobId).subscribe({
            next: (results) => {
              console.log(`[ImageViewer] Got batch results:`, results);
              console.log(`[ImageViewer] Results type:`, typeof results);
              console.log(`[ImageViewer] Results keys:`, Object.keys(results));
              
              // Apply ratings to our local storage
              Object.entries(results).forEach(([filename, resultData]: [string, any]) => {
                // Handle both old format (number) and new format (object with score and correction info)
                const score = typeof resultData === 'number' ? resultData : resultData.score;
                console.log(`[ImageViewer] Processing result - filename: "${filename}", score: ${score}, feedback applied: ${resultData.feedbackApplied || false}`);
                
                this.imageRatings[filename] = score;
                if (this.reviewData!.imageRatings) {
                  this.reviewData!.imageRatings[filename] = score;
                }
              });

              console.log(`[ImageViewer] After applying batch results, imageRatings:`, this.imageRatings);
              
              // Reload the rating for the currently displayed image to show it immediately
              if (this.currentImageName) {
                this.updateCurrentImage();
              }
              
              this.autoRatingMessage = `✅ Batch complete! Rated ${Object.keys(results).length}/${totalImages} images`;
              console.log(`[ImageViewer] Batch ratings applied to all images`);

              setTimeout(() => {
                this.autoRatingMessage = '';
              }, 3000);

              this.isAutoRating = false;
            },
            error: (err) => {
              console.error('[ImageViewer] Failed to get batch results:', err);
              this.autoRatingMessage = `❌ Failed to retrieve results: ${err.message}`;
              this.isAutoRating = false;
            }
          });
        },
        error: (err) => {
          console.error('[ImageViewer] Batch polling error:', err);
          this.autoRatingMessage = `❌ Batch processing failed: ${err.message}`;
          this.isAutoRating = false;
        }
      });

    } catch (err) {
      this.autoRatingMessage = `❌ Failed to submit batch: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('[ImageViewer] Batch submission error:', err);
      this.isAutoRating = false;
    }
  }

  /**
   * Open feedback modal for the current image's AI analysis
   */
  openFeedbackModal() {
    if (!this.illustrationAnalysis) {
      this.autoRatingMessage = '⚠ Please analyze the image first';
      return;
    }
    this.showFeedbackModal = true;
  }

  /**
   * Handle feedback submission
   */
  onFeedbackSubmitted(feedback: any) {
    // Build the full file path for the image
    const fullFilePath = `${this.reviewData?.folder}/${this.currentImageName}`;
    const fileName = this.currentImageName.includes('/') 
      ? this.currentImageName.split('/').pop()! 
      : this.currentImageName;

    // Prepare feedback data - now includes component-level adjustments
    const feedbackData = {
      imageId: fileName,
      filePath: fullFilePath,
      aiScore: this.illustrationAnalysis?.overallScore || 0,
      userScore: feedback.userScore,
      correction: feedback.correction,
      reasoning: feedback.reasoning,
      // AI component scores
      components: {
        anatomy: this.illustrationAnalysis?.anatomyScore || 0,
        pose: this.illustrationAnalysis?.poseScore || 0,
        face: this.illustrationAnalysis?.faceQuality || 0,
        background: this.illustrationAnalysis?.backgroundQuality || 0,
        objects: this.illustrationAnalysis?.objectQuality || 0,
        coherence: this.illustrationAnalysis?.coherenceScore || 0
      },
      // NEW: User's adjusted component scores
      adjustedComponents: feedback.componentAdjustments || null,
      adjustmentDetails: feedback.adjustedComponents || null,
      sourcePath: this.reviewData?.folder
    };

    // Determine the correct source path for feedback submission
    // For artist-gallery: use baseFolder from additionalData (the source folder)
    // For prompt-grouping: use folder (already set to base folder)
    // For reviews: use folder as fallback
    const feedbackSourcePath = 
      (this.reviewData?.apiType === 'artist-gallery' && this.reviewData?.additionalData?.baseFolder) 
        ? this.reviewData.additionalData.baseFolder 
        : this.reviewData?.folder;

    // Submit feedback to backend
    this.aiFeedbackService.submitFeedback(feedbackData, feedbackSourcePath).subscribe(
      (response: any) => {
        console.log('[ImageViewer] Feedback submitted successfully:', response);
        console.log('[ImageViewer] Component adjustments recorded:', feedback.adjustedComponents);
        
        // ✅ UPDATE LOCAL RATING TO REFLECT FEEDBACK
        const fileBasename = fileName;
        this.currentImageRating = feedback.userScore;
        this.imageRatings[fileBasename] = feedback.userScore;
        this.ratingsModified = true;
        
        console.log('[ImageViewer] Updated rating for', fileBasename, ':', this.currentImageRating);
        console.log('[ImageViewer] imageRatings object:', this.imageRatings);
        
        this.autoRatingMessage = `✓ Feedback recorded! (${response.feedbackCount} total corrections)`;
        this.showFeedbackModal = false;
        
        // Trigger change detection to update UI
        this.cdr.detectChanges();
      },
      (error: any) => {
        console.error('[ImageViewer] Feedback submission error:', error);
        this.autoRatingMessage = '❌ Failed to record feedback';
      }
    );
  }

  /**
   * Close feedback modal
   */
  closeFeedbackModal() {
    this.showFeedbackModal = false;
  }

  close() {
    // Emit ratings before closing
    console.log('[Modal] Closing modal...');
    console.log('[Modal] currentImageRating:', this.currentImageRating);
    console.log('[Modal] imageRatings object:', this.imageRatings);
    console.log('[Modal] imageRatings keys:', Object.keys(this.imageRatings));
    console.log('[Modal] imageRatings size:', Object.keys(this.imageRatings).length);
    console.log('[Modal] ratingsModified:', this.ratingsModified);
    
    // Emit ratings if there are any, OR if ratings were modified (e.g., cleared)
    if (Object.keys(this.imageRatings).length > 0 || this.ratingsModified) {
      console.log('[Modal] Emitting ratingsChanged with:', this.imageRatings);
      this.ratingsChanged.emit(this.imageRatings);
    } else {
      console.log('[Modal] No ratings to emit');
    }
    console.log('[Modal] Emitting closeModal event');
    this.closeModal.emit();
  }

  /**
   * Toggle metadata sidebar visibility
   */
  toggleSidebar() {
    this.showSidebar = !this.showSidebar;
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  /**
   * Open the current image in Finder (macOS) or default file manager
   */
  async openImageInFinder(): Promise<void> {
    if (!this.reviewData) {
      this.openFinderError = 'No image data available';
      return;
    }

    // Build the full file path
    const fullFilePath = `${this.reviewData.folder}/${this.currentImageName}`;
    
    try {
      this.openFinderError = '';
      const response = await this.http.post<{ success: boolean; error?: string }>(
        'http://localhost:3000/api/open-file',
        { path: fullFilePath }
      ).toPromise();

      if (!response?.success) {
        this.openFinderError = response?.error || 'Failed to open file in Finder';
        console.error('[ImageViewer] Failed to open file:', this.openFinderError);
      } else {
        console.log('[ImageViewer] Successfully opened file in Finder:', fullFilePath);
      }
    } catch (err) {
      this.openFinderError = err instanceof Error ? err.message : 'Unknown error opening file';
      console.error('[ImageViewer] Error opening file:', err);
    }
  }

  /**
   * Display correction sign for score adjustments
   * Positive = score increased, Negative = score decreased
   */
  getCorrectionSign(correction: number): string {
    if (correction === 0) return '±0';
    if (correction > 0) return `+${correction.toFixed(1)}`;
    return `${correction.toFixed(1)}`;
  }

  /**
   * Get component adjustments as readable format
   */
  getComponentAdjustments(components: any): string[] {
    if (!components) return [];
    const adjustments: string[] = [];
    for (const [key, value] of Object.entries(components)) {
      adjustments.push(`${key}: ${value}/10`);
    }
    return adjustments;
  }
}
