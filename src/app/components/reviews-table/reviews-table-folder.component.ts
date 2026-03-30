import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReviewsFolderService, Review } from '../../services/reviews-folder.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';
import { ArtistGalleryService } from '../../services/artist-gallery.service';
import { PromptGroupingService } from '../../services/prompt-grouping.service';
import { TagFilterComponent } from '../tag-filter/tag-filter.component';
import { TagManagerComponent } from '../tag-manager/tag-manager.component';

/**
 * Reviews Table Component (Source Folder Based)
 * Displays reviews stored in source folder's .reviews.json in table format
 * Shows ratings columns, thumbnails, tags, and allows edit/delete operations
 */
@Component({
  selector: 'app-reviews-table',
  standalone: true,
  imports: [
    CommonModule, 
    HttpClientModule, 
    ImageViewerModalComponent,
    TagFilterComponent,
    TagManagerComponent
  ],
  templateUrl: './reviews-table-folder.component.html',
  styleUrls: ['./reviews-table-folder.component.scss']
})
export class ReviewsTableComponent implements OnInit, OnChanges, OnDestroy {
  @Input() sourceFolder: string | null = null;
  @Output() editReview = new EventEmitter<Review>();
  @Output() deleteReview = new EventEmitter<string>();
  
  reviews: Review[] = [];
  allReviews: Review[] = []; // Keep unfiltered list
  isLoading: boolean = false;
  error: string | null = null;
  showBackToTopButton = false;
  
  // Tags
  showTagManager: boolean = false;
  showTagFilter: boolean = false;
  selectedTagFilters: string[] = [];
  
  // Sorting
  sortByAverage: 'none' | 'asc' | 'desc' = 'none';
  
  // Notes tooltip hover state
  hoveredNoteId: string | null = null;
  
  // Thumbnail URLs map: review.id -> thumbnail URL
  reviewThumbnails: { [reviewId: string]: string } = {};
  
  // Image tags map: review.id -> array of tag details { id, name, color }
  reviewImageTags: { [reviewId: string]: any[] } = {};
  
  // Modal state for viewing source images
  isImageModalOpen: boolean = false;
  selectedReviewForModal: Review | null = null;
  modalData: ReviewImage | null = null;
  // Track the correct tags folder path for the selected review
  selectedReviewTagsSourcePath: string | null = null;
  // Store latest ratings from modal for saving
  private latestModalRatings: { [filename: string]: number } | null = null;

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
    this.reviewImageTags = {};

    this.reviewsFolderService.loadReviewsFromFolder(this.sourceFolder).subscribe({
      next: (response) => {
        this.allReviews = response.reviews;
        this.reviews = response.reviews;
        this.selectedTagFilters = []; // Reset filters when loading new folder
        this.isLoading = false;
        console.log('[ReviewsTable] Loaded', response.reviews.length, 'reviews from', this.sourceFolder);
        
        // Load thumbnails for all reviews
        this.loadThumbnailsForReviews();
        
        // Load image tags for all reviews
        this.loadImageTagsForReviews();
      },
      error: (err) => {
        console.error('[ReviewsTable] Error loading reviews:', err);
        this.error = 'Failed to load reviews: ' + (err.error?.error || err.message);
        this.reviews = [];
        this.allReviews = [];
        this.isLoading = false;
      }
    });
  }

  /**
   * Handle tag filter changes
   */
  onTagFiltersChanged(tagIds: string[]): void {
    this.selectedTagFilters = tagIds;
    this.applyTagFilters();
  }

  /**
   * Apply tag filters to reviews
   * Filters based on image-level tags (stored in reviewImageTags)
   * AND logic - review must have ALL selected tags on its images
   */
  private applyTagFilters(): void {
    if (this.selectedTagFilters.length === 0) {
      this.reviews = [...this.allReviews];
    } else {
      this.reviews = this.allReviews.filter(review => {
        // Check image-level tags from reviewImageTags instead of review.tags
        const imageTags = this.reviewImageTags[review.id] || [];
        const imageTagIds = imageTags.map((tag: any) => tag.id || tag);
        
        // Review must have ALL selected tags (AND logic)
        return this.selectedTagFilters.every((tagId: string) => 
          imageTagIds.includes(tagId)
        );
      });
    }
    console.log('[ReviewsTable] Filtered to', this.reviews.length, 'reviews with tags:', this.selectedTagFilters);
  }

  /**
   * Sort reviews by average rating
   * Cycles through: none -> asc -> desc -> none
   */
  onSortByAverage(): void {
    // Cycle through sort directions
    if (this.sortByAverage === 'none') {
      this.sortByAverage = 'asc';
    } else if (this.sortByAverage === 'asc') {
      this.sortByAverage = 'desc';
    } else {
      this.sortByAverage = 'none';
    }

    // Apply sort
    if (this.sortByAverage === 'none') {
      // Reset to original order from allReviews
      this.applyTagFilters(); // Reapplies filters but in original order
    } else {
      // Sort current reviews array by average rating
      const sorted = [...this.reviews];
      sorted.sort((a, b) => {
        const avgA = this.getAverageRatingNumber(a);
        const avgB = this.getAverageRatingNumber(b);
        
        if (this.sortByAverage === 'asc') {
          return avgA - avgB;
        } else {
          return avgB - avgA;
        }
      });
      this.reviews = sorted;
    }
  }

  /**
   * Get average rating as a number for sorting
   */
  private getAverageRatingNumber(review: Review): number {
    const values = [
      review.rating?.anatomy || 0,
      review.rating?.face || 0,
      review.rating?.object || 0,
      review.rating?.background || 0,
      review.rating?.character || 0
    ];
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Toggle tag manager visibility
   */
  toggleTagManager(): void {
    this.showTagManager = !this.showTagManager;
  }

  /**
   * Toggle tag filter visibility
   */
  toggleTagFilter(): void {
    this.showTagFilter = !this.showTagFilter;
  }

  /**
   * Handle tag manager update
   */
  onTagsUpdated(tags: any[]): void {
    console.log('[ReviewsTable] Tags updated:', tags);
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
    this.http.post('http://localhost:3001/api/artist-gallery/group-images', {
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
    this.http.post('http://localhost:3001/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        if (response.groups && response.groups[review.foreign_id]) {
          const groupData = response.groups[review.foreign_id];
          if (groupData.images && groupData.images.length > 0) {
            const firstImage = groupData.images[0];
            // The images array contains relative paths from sourceFolder, so prepend it
            const fullImagePath = `${this.sourceFolder}/${firstImage}`;
            const thumbnailUrl = `http://localhost:3001/api/prompt-grouping/image?filePath=${encodeURIComponent(fullImagePath)}&thumbnail=true&v=${Date.now()}`;
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
   * Load image tags for all reviews
   */
  private loadImageTagsForReviews(): void {
    this.reviews.forEach(review => {
      // For artist gallery, pass sourceFolder as the tags source path (parent folder where .tags.json is)
      // For prompt grouping, also pass sourceFolder which is the correct location
      const tagsSourcePath = review.source === 'artist_gallery' ? this.sourceFolder : this.sourceFolder;
      this.loadImageTagsForReview(review, tagsSourcePath);
    });
  }

  /**
   * Load image tags for a single review
   */
  private loadImageTagsForReview(review: Review, tagsSourcePath: string | null = null): void {
    console.log('[ReviewsTable] loadImageTagsForReview called for review:', review.id);
    console.log('[ReviewsTable] Review source:', review.source, 'foreign_id:', review.foreign_id);
    console.log('[ReviewsTable] tagsSourcePath param:', tagsSourcePath);
    
    // Use provided tagsSourcePath or fall back to selectedReviewTagsSourcePath (set when modal opened)
    // IMPORTANT: Use sourceFolder as default for artist gallery (parent folder where .tags.json is)
    let actualTagsSourcePath = tagsSourcePath;
    if (!actualTagsSourcePath) {
      actualTagsSourcePath = this.selectedReviewTagsSourcePath;
    }
    if (!actualTagsSourcePath) {
      actualTagsSourcePath = this.sourceFolder;
    }
    console.log('[ReviewsTable] Using actualTagsSourcePath:', actualTagsSourcePath);
    
    if (review.source === 'artist_gallery') {
      console.log('[ReviewsTable] Loading artist gallery image tags');
      this.loadArtistGalleryImageTags(review, actualTagsSourcePath);
    } else if (review.source === 'prompt_grouping') {
      console.log('[ReviewsTable] Loading prompt grouping image tags');
      this.loadPromptGroupingImageTags(review, actualTagsSourcePath);
    } else {
      console.warn('[ReviewsTable] Unknown review source:', review.source);
    }
  }

  /**
   * Load image tags from artist gallery folder
   */
  private loadArtistGalleryImageTags(review: Review, tagsSourcePath: string | null = null): void {
    // Use provided tagsSourcePath ONLY - don't fall back to foreign_id
    const actualTagsSourcePath = tagsSourcePath || this.sourceFolder || review.foreign_id;
    console.log('[ReviewsTable] loadArtistGalleryImageTags for review:', review.id, 'folder:', review.foreign_id, 'tagsSourcePath:', actualTagsSourcePath);
    
    // Get images from the folder
    this.http.post('http://localhost:3001/api/artist-gallery/group-images', {
      folderPath: review.foreign_id
    }).subscribe({
      next: (response: any) => {
        console.log('[ReviewsTable] Got group images response:', response.images?.length || 0, 'images');
        console.log('[ReviewsTable] Raw images from API:', response.images);
        if (response.images && response.images.length > 0) {
          // Get union of tags for all images in this group
          // Use display names as-is from API response, joined with pipe delimiter
          const imageFilenames = response.images.join('|');
          console.log('[ReviewsTable] Fetching union tags from tagsSourcePath:', actualTagsSourcePath, 'with imageFilenames:', imageFilenames);
          this.http.get<any>(
            `http://localhost:3001/api/tags/images/union-tags?sourcePath=${encodeURIComponent(actualTagsSourcePath)}&imageFilenames=${encodeURIComponent(imageFilenames)}`
          ).subscribe({
            next: (tagsResponse) => {
              console.log('[ReviewsTable] Union tags response:', tagsResponse);
              if (tagsResponse.success && tagsResponse.tags) {
                console.log('[ReviewsTable] Setting reviewImageTags for', review.id, 'to', tagsResponse.tags.length, 'tags');
                this.reviewImageTags = { ...this.reviewImageTags, [review.id]: tagsResponse.tags };
                console.log('[ReviewsTable] Updated reviewImageTags object:', this.reviewImageTags);
                // Re-apply filters after tags are loaded to ensure filtering is correct
                this.applyTagFilters();
              } else {
                console.warn('[ReviewsTable] Tag response missing success or tags:', tagsResponse);
              }
            },
            error: (err) => {
              console.warn('[ReviewsTable] Error loading image tags for review:', err);
              this.reviewImageTags = { ...this.reviewImageTags, [review.id]: [] };
            }
          });
        } else {
          console.warn('[ReviewsTable] No images in group response');
        }
      },
      error: (err) => {
        console.warn('[ReviewsTable] Error loading artist gallery images:', err);
      }
    });
  }

  /**
   * Load image tags from prompt grouping group
   */
  private loadPromptGroupingImageTags(review: Review, tagsSourcePath: string | null = null): void {
    // Use provided tagsSourcePath or fall back to sourceFolder
    const actualTagsSourcePath = tagsSourcePath || this.sourceFolder || '';
    console.log('[ReviewsTable] loadPromptGroupingImageTags for review:', review.id, 'foreign_id:', review.foreign_id, 'tagsSourcePath:', actualTagsSourcePath);
    
    this.http.post('http://localhost:3001/api/prompt-grouping/load-groups', {
      folderPath: this.sourceFolder
    }).subscribe({
      next: (response: any) => {
        console.log('[ReviewsTable] Got groups response, groups:', Object.keys(response.groups || {}));
        if (response.groups && response.groups[review.foreign_id]) {
          const groupData = response.groups[review.foreign_id];
          console.log('[ReviewsTable] Group data images:', groupData.images?.length || 0);
          if (groupData.images && groupData.images.length > 0) {
            // Images are relative to sourceFolder, convert to full paths
            const fullImagePaths = groupData.images.map((relativePath: string) =>
              `${this.sourceFolder}/${relativePath}`
            );
            // Use pipe delimiter between filenames
            const imageFilenames = fullImagePaths.join('|');
            console.log('[ReviewsTable] Fetching union tags from tagsSourcePath:', actualTagsSourcePath, 'with imageFilenames:', imageFilenames);
            
            // Get union of tags for all images in this group
            this.http.get<any>(
              `http://localhost:3001/api/tags/images/union-tags?sourcePath=${encodeURIComponent(actualTagsSourcePath)}&imageFilenames=${encodeURIComponent(imageFilenames)}`
            ).subscribe({
              next: (tagsResponse) => {
                console.log('[ReviewsTable] Union tags response:', tagsResponse);
                if (tagsResponse.success && tagsResponse.tags) {
                  console.log('[ReviewsTable] Setting reviewImageTags for', review.id, 'to', tagsResponse.tags.length, 'tags');
                  this.reviewImageTags = { ...this.reviewImageTags, [review.id]: tagsResponse.tags };
                  console.log('[ReviewsTable] Updated reviewImageTags object:', this.reviewImageTags);                // Re-apply filters after tags are loaded to ensure filtering is correct
                this.applyTagFilters();                } else {
                  console.warn('[ReviewsTable] Tag response missing success or tags:', tagsResponse);
                }
              },
              error: (err) => {
                console.warn('[ReviewsTable] Error loading image tags for review:', err);
                this.reviewImageTags = { ...this.reviewImageTags, [review.id]: [] };
              }
            });
          } else {
            console.warn('[ReviewsTable] No images in group');
          }
        } else {
          console.warn('[ReviewsTable] Group not found for id:', review.foreign_id);
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
    console.log('[ReviewsTable] OPENING MODAL for review:', review.id);
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
    this.http.post('http://localhost:3001/api/artist-gallery/group-images', {
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
                // Ratings are stored with filename as key for cross-source compatibility
                images.forEach((filename: string) => {
                  if (allRatings[filename]) {
                    imageRatings[filename] = allRatings[filename];
                  }
                });
              }
              
              this.modalData = {
                images: images,
                folder: review.foreign_id,
                tagsSourcePath: this.sourceFolder || undefined, // Use parent folder for tags
                apiType: 'artist-gallery',
                title: review.foreign_id.split('/').pop() || 'Artist Gallery',
                imageRatings: imageRatings,
                additionalData: review
              };
              // Track the tags source path for this review
              this.selectedReviewTagsSourcePath = this.sourceFolder || review.foreign_id;
              console.log('[ReviewsTable] Prepared artist gallery modal with', images.length, 'images and tagsSourcePath:', this.selectedReviewTagsSourcePath);
            },
            error: (err) => {
              console.error('[ReviewsTable] Error loading artist gallery ratings:', err);
              // Still open modal without ratings
              this.modalData = {
                images: images,
                folder: review.foreign_id,
                tagsSourcePath: this.sourceFolder || undefined, // Use parent folder for tags
                apiType: 'artist-gallery',
                title: review.foreign_id.split('/').pop() || 'Artist Gallery',
                additionalData: review
              };
              // Track the tags source path for this review
              this.selectedReviewTagsSourcePath = this.sourceFolder || review.foreign_id;
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
    this.http.post('http://localhost:3001/api/prompt-grouping/load-groups', {
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
                  // Ratings are stored with basename as key for cross-source compatibility
                  // (same format as artist gallery and image modal)
                  images.forEach((fullPath: string) => {
                    // Extract basename to match rating keys
                    const basename = fullPath.includes('/') ? fullPath.split('/').pop()! : fullPath;
                    if (allRatings[basename]) {
                      imageRatings[basename] = allRatings[basename];
                    }
                  });
                }
                
                this.modalData = {
                  images: images,
                  folder: '', // Empty since images already have full paths after prepending sourceFolder
                  tagsSourcePath: this.sourceFolder || undefined, // Use sourceFolder for prompt grouping tags
                  prompt: groupData.prompt || '',
                  apiType: 'prompt-grouping',
                  title: response.groupNicknames?.[review.foreign_id] || `Group ${review.foreign_id}`,
                  imageRatings: imageRatings,
                  additionalData: review
                };
                // Track the tags source path for this review
                this.selectedReviewTagsSourcePath = this.sourceFolder || '';
                console.log('[ReviewsTable] Prepared prompt grouping modal with', images.length, 'images and tagsSourcePath:', this.selectedReviewTagsSourcePath);
              },
              error: (err) => {
                console.error('[ReviewsTable] Error loading prompt grouping ratings:', err);
                // Still open modal without ratings
                this.modalData = {
                  images: images,
                  folder: '', // Empty since images already have full paths
                  tagsSourcePath: this.sourceFolder || undefined, // Use sourceFolder for prompt grouping tags
                  prompt: groupData.prompt || '',
                  apiType: 'prompt-grouping',
                  title: response.groupNicknames?.[review.foreign_id] || `Group ${review.foreign_id}`,
                  additionalData: review
                };
                // Track the tags source path for this review
                this.selectedReviewTagsSourcePath = this.sourceFolder || '';
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
   * Handle ratings changed from modal
   */
  onRatingsChanged(ratings: { [filename: string]: number }): void {
    console.log('[ReviewsTable] Ratings changed from modal:', ratings);
    this.latestModalRatings = ratings;
    if (this.modalData) {
      this.modalData.imageRatings = ratings;
      console.log('[ReviewsTable] Stored ratings in modal data:', this.modalData.imageRatings);
    }
  }

  /**
   * Handle image tags changed from image viewer modal
   */
  onImageTagsChanged(imageTags: { [filename: string]: string[] }): void {
    console.log('[ReviewsTable] ===== onImageTagsChanged CALLED =====');
    console.log('[ReviewsTable] Step 1: Image tags param:', imageTags);
    console.log('[ReviewsTable] Step 2: modalData:', this.modalData ? 'exists' : 'null');
    console.log('[ReviewsTable] Step 3: selectedReviewForModal:', this.selectedReviewForModal);
    
    // Tags are already persisted to backend via ImageTagsComponent
    
    // Store tags in modal data for reference
    if (this.modalData) {
      this.modalData.imageTags = imageTags;
      console.log('[ReviewsTable] Step 4a: Stored tags in modal data');
    } else {
      console.log('[ReviewsTable] Step 4a: SKIPPED - modalData is null');
    }
    
    // Refresh the tag display for the selected review
    // IMPORTANT: Capture selectedReviewForModal in a local variable NOW
    // because closeImageModal() might be called soon and will null it out
    const reviewToRefresh = this.selectedReviewForModal;
    if (reviewToRefresh) {
      console.log('[ReviewsTable] Step 5: Captured review', reviewToRefresh.id, 'setting timeout...');
      // Add small delay to ensure backend has persisted the changes
      setTimeout(() => {
        console.log('[ReviewsTable] ===== TIMEOUT FIRED - Reloading tags =====');
        console.log('[ReviewsTable] Using captured review:', reviewToRefresh.id);
        this.loadImageTagsForReview(reviewToRefresh);
      }, 100);
    } else {
      console.warn('[ReviewsTable] ❌ Step 5: selectedReviewForModal is NULL!');
    }
  }

  /**
   * Close image viewer modal and save ratings
   */
  closeImageModal(): void {
    console.log('[ReviewsTable] CLOSING MODAL - selectedReviewForModal:', this.selectedReviewForModal?.id);
    console.log('[ReviewsTable] Closing image modal');
    console.log('[ReviewsTable] Latest modal ratings:', this.latestModalRatings);
    
    // Save ratings if any were modified
    const ratingsToSave = this.latestModalRatings || (this.modalData?.imageRatings);
    if (ratingsToSave && this.selectedReviewForModal && Object.keys(ratingsToSave).length > 0) {
      this.saveImageRatings(ratingsToSave);
    }
    
    this.isImageModalOpen = false;
    this.selectedReviewForModal = null;
    this.modalData = null;
    this.selectedReviewTagsSourcePath = null;
    this.latestModalRatings = null;
  }

  /**
   * Calculate contrast-aware text color for tag badges
   * Returns white text for dark backgrounds, black for light backgrounds
   */
  getTextColor(hexColor: string): string {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Convert hex to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black text for light backgrounds, white for dark
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * Save image ratings to the ratings file
   */
  private saveImageRatings(newRatings: { [filename: string]: number }): void {
    if (!this.sourceFolder) return;
    
    console.log('[ReviewsTable] Saving image ratings:', newRatings);
    
    // Load existing ratings first to merge (don't overwrite)
    this.galleryService.loadRatings(this.sourceFolder).subscribe({
      next: (loadResponse) => {
        const existingRatings = (loadResponse.success && loadResponse.ratings) ? loadResponse.ratings : {};
        console.log('[ReviewsTable] Existing ratings:', existingRatings);
        
        // Merge: keep all existing, update with new ones
        const mergedRatings = { ...existingRatings, ...newRatings };
        console.log('[ReviewsTable] Merged ratings:', mergedRatings);
        
        // Save merged ratings
        this.galleryService.saveRatings(this.sourceFolder!, mergedRatings).subscribe({
          next: (saveResponse) => {
            console.log('[ReviewsTable] Image ratings saved successfully:', saveResponse);
          },
          error: (err) => {
            console.error('[ReviewsTable] Failed to save ratings:', err);
          }
        });
      },
      error: (err) => {
        console.warn('[ReviewsTable] Failed to load existing ratings, saving new ratings only:', err);
        // If we can't load existing, just save what we have
        this.galleryService.saveRatings(this.sourceFolder!, newRatings).subscribe({
          next: (saveResponse) => {
            console.log('[ReviewsTable] Image ratings saved:', saveResponse);
          },
          error: (err2) => {
            console.error('[ReviewsTable] Failed to save ratings:', err2);
          }
        });
      }
    });
  }

  /**
   * Show notes tooltip on hover
   */
  onNotesHover(reviewId: string): void {
    this.hoveredNoteId = reviewId;
  }

  /**
   * Hide notes tooltip on mouse leave
   */
  onNotesLeave(): void {
    this.hoveredNoteId = null;
  }
}
