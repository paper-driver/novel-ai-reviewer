import { Component, Input, OnChanges, OnInit, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReviewService, Review } from '../../services/review.service';
import { ImageViewerModalComponent } from '../image-viewer-modal/image-viewer-modal.component';

@Component({
  selector: 'app-reviews-table',
  standalone: true,
  imports: [CommonModule, ImageViewerModalComponent],
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

  constructor(private reviewService: ReviewService) {}

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
    this.isModalOpen = true;
  }

  /**
   * Closes the image viewer modal
   */
  closeImageViewer(): void {
    this.isModalOpen = false;
    this.selectedReview = null;
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