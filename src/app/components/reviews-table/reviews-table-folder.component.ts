import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReviewsFolderService, Review } from '../../services/reviews-folder.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';
import { ArtistGalleryService } from '../../services/artist-gallery.service';
import { PromptGroupingService } from '../../services/prompt-grouping.service';

/**
 * Reviews Table Component (Source Folder Based)
 * Displays reviews stored in source folder's .reviews.json in table format
 * Shows ratings columns, thumbnails, and allows edit/delete operations
 */
@Component({
  selector: 'app-reviews-table',
  standalone: true,
  imports: [CommonModule, HttpClientModule, ImageViewerModalComponent],
  templateUrl: './reviews-table-folder.component.html',
  styleUrls: ['./reviews-table-folder.component.scss']
})
export class ReviewsTableComponent implements OnInit, OnChanges, OnDestroy {
  @Input() sourceFolder: string | null = null;
  @Output() editReview = new EventEmitter<Review>();
  @Output() deleteReview = new EventEmitter<string>();
  
  reviews: Review[] = [];
  isLoading: boolean = false;
  error: string | null = null;
  showBackToTopButton = false;
  
  // Thumbnail URLs map: review.id -> thumbnail URL
  reviewThumbnails: { [reviewId: string]: string } = {};
  
  // Modal state for viewing source images
  isImageModalOpen: boolean = false;
  selectedReviewForModal: Review | null = null;
  modalData: ReviewImage | null = null;

  private destroy$ = new Subject<void>();
  private scrollListener: (() => void) | null = null;

  constructor(
    private reviewsFolderService: ReviewsFolderService,
    private http: HttpClient,
    private galleryService: ArtistGalleryService,
    private groupingService: PromptGroupingService
  ) {}

  ngOnInit(): void {
    // Load reviews if sourceFolder is provided
    if (this.sourceFolder) {
      this.loadReviews();
    }

    // Listen for scroll events
    this.scrollListener = () => {
      this.showBackToTopButton = window.scrollY > 300;
    };
    window.addEventListener('scroll', this.scrollListener);
  }

  ngOnDestroy(): void {
    // Remove scroll listener
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }
    // Complete subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sourceFolder'] && this.sourceFolder) {
      // Clear old data when folder changes
      this.reviews = [];
      this.reviewThumbnails = {};
      this.error = null;
      console.log('[ReviewsTable] Source folder changed to:', this.sourceFolder);
      this.loadReviews();
    }
  }

  /**
   * Load reviews from source folder's .reviews.json
   */
  loadReviews(): void {
    if (!this.sourceFolder) {
      this.error = 'No source folder selected';
      this.reviews = [];
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.reviewThumbnails = {};

    this.reviewsFolderService.loadReviewsFromFolder(this.sourceFolder).subscribe({
      next: (response) => {
        this.reviews = response.reviews;
        this.isLoading = false;
        console.log('[ReviewsTable] Loaded', response.reviews.length, 'reviews from', this.sourceFolder);
        
        // Load thumbnails for all reviews
        this.loadThumbnailsForReviews();
      },
      error: (err) => {
        console.error('[ReviewsTable] Error loading reviews:', err);
        this.error = 'Failed to load reviews: ' + (err.error?.error || err.message);
        this.reviews = [];
        this.isLoading = false;
      }
    });
  }

  /**
   * Load thumbnail images for all reviews
   * Gets first image from artist gallery or prompt group folder
   */
  private loadThumbnailsForReviews(): void {
    this.reviews.forEach(review => {
      this.loadThumbnailForReview(review);
    });
  }

  /**
   * Load single thumbnail for a review
   * Handles both artist_gallery and prompt_grouping sources
   */
  private loadThumbnailForReview(review: Review): void {
    if (review.source === 'artist_gallery') {
      // For artist gallery: foreign_id is the folder path
      this.loadArtistGalleryThumbnail(review);
    } else if (review.source === 'prompt_grouping') {
      // For prompt grouping: foreign_id is the group id, need to get images
      this.loadPromptGroupingThumbnail(review);
    }
  }

  /**
   * Load thumbnail from artist gallery folder
   */
  private loadArtistGalleryThumbnail(review: Review): void {
    // Get images from the folder
    this.http.post('http://localhost:3000/api/artist-gallery/group-images', {
      folderPath: review.foreign_id
    }).subscribe({
      next: (response: any) => {
        if (response.images && response.images.length > 0) {
          const firstImage = response.images[0];
          const thumbnailUrl = this.galleryService.getThumbnailUrl(review.foreign_id, firstImage);
          this.reviewThumbnails[review.id] = thumbnailUrl;
          console.log('[ReviewsTable] Loaded artist gallery thumbnail:', thumbnailUrl);
        }
      },
      error: (err) => {
        console.warn('[ReviewsTable] Error loading artist gallery images:', err);
      }
    });
  }

  /**
   * Load thumbnail from prompt grouping folder
   * The groupData.images array contains relative paths from sourceFolder
   */
  private loadPromptGroupingThumbnail(review: Review): void {
    this.http.post('http://localhost:3000/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        if (response.groups && response.groups[review.foreign_id]) {
          const groupData = response.groups[review.foreign_id];
          if (groupData.images && groupData.images.length > 0) {
            const firstImage = groupData.images[0];
            // The images array contains relative paths from sourceFolder, so prepend it
            const fullImagePath = `${this.sourceFolder}/${firstImage}`;
            const thumbnailUrl = `http://localhost:3000/api/prompt-grouping/image?filePath=${encodeURIComponent(fullImagePath)}&thumbnail=true&v=${Date.now()}`;
            this.reviewThumbnails[review.id] = thumbnailUrl;
            console.log('[ReviewsTable] Loaded prompt grouping thumbnail:', thumbnailUrl);
          }
        }
      },
      error: (err) => {
        console.warn('[ReviewsTable] Error loading prompt grouping groups:', err);
      }
    });
  }

  /**
   * Format source type for display
   */
  formatSourceType(source: string): string {
    return source === 'artist_gallery' ? 'Artist Gallery' : 'Prompt Grouping';
  }

  /**
   * Get CSS class for rating cell based on rating value
   */
  getRatingClass(rating: number | undefined): string {
    if (!rating || rating === 0) return '';
    if (rating <= 2) return 'rating-low';
    if (rating === 3) return 'rating-medium';
    return 'rating-high';
  }

  /**
   * Get average rating from individual component ratings
   */
  getAverageRating(review: Review): string {
    const values = [
      review.rating?.anatomy || 0,
      review.rating?.face || 0,
      review.rating?.object || 0,
      review.rating?.background || 0,
      review.rating?.character || 0
    ];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return avg.toFixed(1);
  }

  /**
   * Open edit form for a review
   */
  onEditReview(review: Review): void {
    this.editReview.emit(review);
  }

  /**
   * Delete a review
   */
  onDeleteReview(review: Review): void {
    if (!confirm(`Delete review for ${review.foreign_id}?`)) {
      return;
    }

    this.isLoading = true;
    this.reviewsFolderService.deleteReview(this.sourceFolder!, review.id).subscribe({
      next: (response) => {
        this.reviews = this.reviews.filter(r => r.id !== review.id);
        delete this.reviewThumbnails[review.id];
        this.isLoading = false;
        console.log('[ReviewsTable] Review deleted:', review.id);
      },
      error: (err) => {
        console.error('[ReviewsTable] Error deleting review:', err);
        this.error = 'Failed to delete review: ' + (err.error?.error || err.message);
        this.isLoading = false;
      }
    });
  }

  /**
   * Scroll back to top
   */
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  /**
   * Open image viewer modal for source images of this review
   */
  openImageModal(review: Review): void {
    this.selectedReviewForModal = review;
    this.isImageModalOpen = true;
    
    console.log('[ReviewsTable] Opening image modal for review:', review.id, 'source:', review.foreign_id);
    
    // Load images and prepare modal data
    this.loadImagesForModal(review);
  }

  /**
   * Load images for modal display
   */
  private loadImagesForModal(review: Review): void {
    if (review.source === 'artist_gallery') {
      this.loadArtistGalleryImagesForModal(review);
    } else if (review.source === 'prompt_grouping') {
      this.loadPromptGroupingImagesForModal(review);
    }
  }

  /**
   * Load artist gallery images for modal
   */
  private loadArtistGalleryImagesForModal(review: Review): void {
    this.http.post('http://localhost:3000/api/artist-gallery/group-images', {
      folderPath: review.foreign_id
    }).subscribe({
      next: (response: any) => {
        if (response.images && response.images.length > 0) {
          // Store just the image filenames - updateCurrentImage will build the URLs
          const images = response.images;
          
          // Load ratings from the artist gallery
          const ratingsFolder = this.sourceFolder;
          this.galleryService.loadRatings(ratingsFolder || '').subscribe({
            next: (ratingsResponse) => {
              const imageRatings: { [filename: string]: number } = {};
              if (ratingsResponse.success) {
                const allRatings = ratingsResponse.ratings as { [filename: string]: number };
                // Filter to only ratings for images in this group
                images.forEach((filename: string) => {
                  if (allRatings[filename]) {
                    imageRatings[filename] = allRatings[filename];
                  }
                });
              }
              
              this.modalData = {
                images: images,
                folder: review.foreign_id,
                apiType: 'artist-gallery',
                title: review.foreign_id.split('/').pop() || 'Artist Gallery',
                imageRatings: imageRatings,
                additionalData: review
              };
              console.log('[ReviewsTable] Prepared artist gallery modal with', images.length, 'images and', Object.keys(imageRatings).length, 'ratings');
            },
            error: (err) => {
              console.error('[ReviewsTable] Error loading artist gallery ratings:', err);
              // Still open modal without ratings
              this.modalData = {
                images: images,
                folder: review.foreign_id,
                apiType: 'artist-gallery',
                title: review.foreign_id.split('/').pop() || 'Artist Gallery',
                additionalData: review
              };
            }
          });
        }
      },
      error: (err) => {
        console.error('[ReviewsTable] Error loading artist gallery images for modal:', err);
      }
    });
  }

  /**
   * Load prompt grouping images for modal
   * The groupData.images array contains relative paths from sourceFolder
   */
  private loadPromptGroupingImagesForModal(review: Review): void {
    this.http.post('http://localhost:3000/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        if (response.groups && response.groups[review.foreign_id]) {
          const groupData = response.groups[review.foreign_id];
          if (groupData.images && groupData.images.length > 0) {
            // Images are relative paths from sourceFolder
            // Convert to full paths by prepending sourceFolder
            const images = groupData.images.map((relativePath: string) => 
              `${this.sourceFolder}/${relativePath}`
            );
            
            // Load ratings from the prompt grouping
            this.groupingService.loadRatings(this.sourceFolder || '').subscribe({
              next: (ratingsResponse) => {
                const imageRatings: { [filename: string]: number } = {};
                if (ratingsResponse.success) {
                  const allRatings = ratingsResponse.ratings as { [filename: string]: number };
                  // Filter to only ratings for images in this group
                  images.forEach((fullPath: string) => {
                    if (allRatings[fullPath]) {
                      imageRatings[fullPath] = allRatings[fullPath];
                    }
                  });
                }
                
                this.modalData = {
                  images: images,
                  folder: '', // Empty since images already have full paths after prepending sourceFolder
                  prompt: groupData.prompt || '',
                  apiType: 'prompt-grouping',
                  title: response.groupNicknames?.[review.foreign_id] || `Group ${review.foreign_id}`,
                  imageRatings: imageRatings,
                  additionalData: review
                };
                console.log('[ReviewsTable] Prepared prompt grouping modal with', images.length, 'images and', Object.keys(imageRatings).length, 'ratings');
              },
              error: (err) => {
                console.error('[ReviewsTable] Error loading prompt grouping ratings:', err);
                // Still open modal without ratings
                this.modalData = {
                  images: images,
                  folder: '', // Empty since images already have full paths
                  prompt: groupData.prompt || '',
                  apiType: 'prompt-grouping',
                  title: response.groupNicknames?.[review.foreign_id] || `Group ${review.foreign_id}`,
                  additionalData: review
                };
              }
            });
          }
        }
      },
      error: (err) => {
        console.error('[ReviewsTable] Error loading prompt grouping images for modal:', err);
      }
    });
  }

  /**
   * Close image viewer modal
   */
  closeImageModal(): void {
    this.isImageModalOpen = false;
    this.selectedReviewForModal = null;
    this.modalData = null;
  }
}
