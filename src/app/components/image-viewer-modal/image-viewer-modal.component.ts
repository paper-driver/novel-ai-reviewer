import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
}

@Component({
  selector: 'app-image-viewer-modal',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './image-viewer-modal.component.html',
  styleUrls: ['./image-viewer-modal.component.scss']
})
export class ImageViewerModalComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isOpen: boolean = false;
  @Input() reviewData: ReviewImage | null = null;
  @Output() closeModal = new EventEmitter<void>();
  @ViewChild('imageElement') imageElement: ElementRef<HTMLImageElement> | null = null;

  currentImageIndex: number = 0;
  currentImageUrl: string = '';
  currentImageName: string = '';
  imageWidth: number = 0;
  imageHeight: number = 0;
  imageSizeKB: number = 0;
  
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

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.updateCurrentImage();
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  ngOnChanges() {
    if (this.isOpen && this.reviewData) {
      this.currentImageIndex = 0;
      this.zoomLevel = 100;
      this.resetPan();
      this.prompt = this.reviewData.prompt || '';
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
      
      // Clear previous metadata when switching images
      this.prompt = '';
      this.artists = [];
      
      // Build image URL based on API type
      const apiType = this.reviewData.apiType || 'reviews';
      console.log(`[ImageViewer] Updating current image to: ${fileName}, apiType: ${apiType}`);
      
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
      
      // Fetch image metadata (dimensions and size)
      this.fetchImageMetadata();
    }
  }

  /**
   * Fetch image dimensions and size metadata
   */
  fetchImageMetadata() {
    const img = new Image();
    img.onload = () => {
      this.imageWidth = img.naturalWidth;
      this.imageHeight = img.naturalHeight;
    };
    img.src = this.currentImageUrl;
    
    // Fetch file size
    fetch(this.currentImageUrl)
      .then(response => response.blob())
      .then(blob => {
        this.imageSizeKB = Math.round(blob.size / 1024);
      })
      .catch(err => console.error('Error fetching image metadata:', err));
    
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
   * Handle mouse wheel zoom
   */
  onMouseWheel(event: WheelEvent) {
    event.preventDefault();
    
    // Scroll up = zoom in, scroll down = zoom out
    const direction = event.deltaY > 0 ? -1 : 1;
    const newZoom = this.zoomLevel + direction * this.zoomStep;
    
    if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
      this.zoomLevel = newZoom;
    }
  }

  /**
   * Handle mouse down for pan drag
   */
  onMouseDown(event: MouseEvent) {
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
    }
  }

  prevImage() {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.resetPan();
      this.updateCurrentImage();
    }
  }

  getThumbnailUrl(image: string): string {
    if (!this.reviewData) return '';
    
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
    console.log(`[ImageViewer] getThumbnailUrl for ${image}: ${url}`);
    return url;
  }

  close() {
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
}
