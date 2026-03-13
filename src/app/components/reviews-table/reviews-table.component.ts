import { Component, Input, OnChanges, OnInit, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ReviewService, Review } from '../../services/review.service';
import { ImageViewerModalComponent } from '../image-viewer-modal/image-viewer-modal.component';

@Component({
  selector: 'app-reviews-table',
  standalone: true,
  imports: [CommonModule, HttpClientModule, ImageViewerModalComponent],
  templateUrl: './reviews-table.component.html',
  styleUrls: ['./reviews-table.component.scss']
})
export class ReviewsTableComponent implements OnInit, OnChanges {
  @Input() filters: any;
  @Output() editReview = new EventEmitter<Review>();
  
  reviews: Review[] = [];
  
  isModalOpen: boolean = false;
  selectedReview: any = null;

  // Back to top button
  showBackToTopButton = false;

  constructor(private reviewService: ReviewService, private http: HttpClient) {}

  ngOnInit(): void {
    this.loadReviews();
    // Listen for scroll events to show/hide back-to-top button
    window.addEventListener('scroll', () => {
      this.showBackToTopButton = window.scrollY > 300;
    });
  }

  /**
   * Scroll back to top of the page smoothly
   */
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.filters) {
      this.loadReviews();
    }
  }

  /**
   * Fetch reviews from the backend applying current filters
   */
  loadReviews(): void {
    this.reviewService.getReviews(this.filters).subscribe(res => {
      this.reviews = res.map(r => ({ ...r, showImages: false } as any));
    });
  }

  /**
   * Constructs a URL pointing to a thumbnail image
   */
  getThumbnailUrl(review: Review): string {
    return `http://localhost:3000/api/images/${review.folder}/${review.thumbnail}`;
  }

  /**
   * Opens the image viewer modal for a specific review
   */
  openImageViewer(review: Review): void {
    this.selectedReview = {
      images: review.images,
      folder: review.folder,
      prompt: review.prompt,
      review: review.review
    };
    
    // Load ratings from backend
    this.http.get<{ success: boolean; ratings: { [filename: string]: number } }>(
      `http://localhost:3000/api/ratings/load?folderPath=${encodeURIComponent(review.folder)}`
    ).subscribe(
      res => {
        if (res.success && res.ratings) {
          this.selectedReview.imageRatings = res.ratings;
          console.log('[ReviewsTable] Loaded ratings:', this.selectedReview.imageRatings);
        }
        this.isModalOpen = true;
      },
      err => {
        console.warn('[ReviewsTable] Failed to load ratings:', err);
        // Still open modal even if ratings fail to load
        this.isModalOpen = true;
      }
    );
  }

  /**
   * Closes the image viewer modal
   */
  closeImageViewer(): void {
    this.isModalOpen = false;
    this.selectedReview = null;
  }

  /**
   * Handle ratings changed event from modal
   * Save ratings to backend and preserve existing ratings
   */
  onRatingsChanged(newRatings: { [filename: string]: number }): void {
    if (!this.selectedReview || !this.selectedReview.folder) {
      console.warn('[ReviewsTable] No selected review folder for saving ratings');
      return;
    }

    console.log('[ReviewsTable] Ratings changed, saving to server...');
    console.log('[ReviewsTable] New ratings:', newRatings);

    // First load existing ratings from server
    this.http.get<{ success: boolean; ratings: { [filename: string]: number } }>(
      `http://localhost:3000/api/ratings/load?folderPath=${encodeURIComponent(this.selectedReview.folder)}`
    ).subscribe(
      res => {
        // Merge existing ratings with new ratings
        const existingRatings = res.success && res.ratings ? res.ratings : {};
        const mergedRatings = { ...existingRatings, ...newRatings };
        
        console.log('[ReviewsTable] Existing ratings:', existingRatings);
        console.log('[ReviewsTable] Merged ratings:', mergedRatings);

        // Save merged ratings
        this.http.post('http://localhost:3000/api/ratings/save', {
          folderPath: this.selectedReview.folder,
          ratings: mergedRatings
        }).subscribe(
          saveRes => {
            console.log('[ReviewsTable] Ratings saved successfully:', saveRes);
          },
          saveErr => {
            console.error('[ReviewsTable] Failed to save ratings:', saveErr);
          }
        );
      },
      err => {
        console.warn('[ReviewsTable] Failed to load existing ratings, saving new ratings only:', err);
        
        // If we can't load existing ratings, just save the new ones
        this.http.post('http://localhost:3000/api/ratings/save', {
          folderPath: this.selectedReview.folder,
          ratings: newRatings
        }).subscribe(
          saveRes => {
            console.log('[ReviewsTable] Ratings saved successfully:', saveRes);
          },
          saveErr => {
            console.error('[ReviewsTable] Failed to save ratings:', saveErr);
          }
        );
      }
    );
  }

  /**
   * Opens the review editing with the form
   */
  openEditReview(review: Review): void {
    this.editReview.emit(review);
  }

  /**
   * Opens edit on row click (except for action buttons and thumbnail)
   */
  onRowClick(review: Review, event: MouseEvent): void {
    // Don't open edit if clicking on buttons or thumbnail image
    const target = event.target as HTMLElement;
    if (!target.closest('button') && !target.closest('.thumbnail')) {
      this.openEditReview(review);
    }
  }

  /**
   * Deletes a review and refreshes the list
   */
  deleteReview(review: Review): void {
    if (confirm(`Are you sure you want to delete the review for "${review.prompt}"?`)) {
      this.reviewService.deleteReview(review.id).subscribe(() => {
        this.loadReviews();
      });
    }
  }
}