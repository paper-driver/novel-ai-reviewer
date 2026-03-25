import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReviewFormComponent } from './components/review-form/review-form.component';
import { FilterPanelComponent } from './components/filter-panel/filter-panel.component';
import { ReviewsTableComponent } from './components/reviews-table/reviews-table.component';
import { ArtistGroupingComponent } from './components/artist-grouping/artist-grouping.component';
import { ArtistGalleryComponent } from './components/artist-gallery/artist-gallery.component';
import { PromptGroupingComponent } from './components/prompt-grouping/prompt-grouping.component';
import { FloatingStatsComponent } from './components/floating-stats/floating-stats.component';
import { ReviewsManagementComponent } from './components/reviews-management/reviews-management.component';
import { ReviewRequestService, ReviewRequest } from './services/review-request.service';
import { Review } from './services/review.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReviewFormComponent,
    FilterPanelComponent,
    ReviewsTableComponent,
    ArtistGroupingComponent,
    ArtistGalleryComponent,
    PromptGroupingComponent,
    FloatingStatsComponent,
    ReviewsManagementComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  filters: any = {};
  editingReview: Review | null = null;
  currentTab: 'reviews' | 'reviews-management' | 'grouping' | 'gallery' | 'prompt-grouping' = 'reviews';
  
  // Review request from gallery/grouping components
  pendingReviewRequest: ReviewRequest | null = null;
  
  private destroy$ = new Subject<void>();

  constructor(private reviewRequestService: ReviewRequestService) {}

  ngOnInit(): void {
    // Listen for review requests from artist gallery or prompt grouping
    this.reviewRequestService.reviewRequest$
      .pipe(takeUntil(this.destroy$))
      .subscribe(request => {
        if (request) {
          console.log('[AppComponent] Review request received:', request);
          this.pendingReviewRequest = request;
          // Switch to reviews-management tab with the review request data
          this.currentTab = 'reviews-management';
          // Scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handler invoked when filters change or when a review is created.
   * @param f Filter object from child components
   */
  onFiltersChange(f: any) {
    this.filters = { ...f };
  }

  /**
   * Handler invoked when user clicks edit on a review
   */
  onEditReview(review: Review) {
    this.editingReview = review;
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Handler invoked after review is created or updated
   */
  onReviewChange() {
    this.editingReview = null;
    this.filters = { ...this.filters };
  }
}