import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ReviewImage {
  images: string[];
  folder: string;
  prompt?: string;
  review?: string;
}

@Component({
  selector: 'app-image-viewer-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-viewer-modal.component.html',
  styleUrls: ['./image-viewer-modal.component.scss']
})
export class ImageViewerModalComponent implements OnInit {
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

  ngOnInit() {
    this.updateCurrentImage();
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

  updateCurrentImage() {
    if (this.reviewData && this.reviewData.images.length > 0) {
      const fileName = this.reviewData.images[this.currentImageIndex];
      this.currentImageName = fileName;
      this.currentImageUrl = `http://localhost:3000/api/images/${this.reviewData.folder}/${fileName}`;
      
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
      fetch(`http://localhost:3000/api/image-metadata/${this.reviewData.folder}/${this.currentImageName}`)
        .then(response => response.json())
        .then(data => {
          if (data.prompt) {
            this.prompt = data.prompt;
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
}
