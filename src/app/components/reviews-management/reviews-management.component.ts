import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FolderSelectorComponent } from '../folder-selector/folder-selector.component';
import { ReviewsTableComponent } from '../reviews-table/reviews-table-folder.component';
import { ReviewFormComponent } from '../review-form/review-form-folder.component';
import { CurrentSourceFolderService } from '../../services/current-source-folder.service';
import { ReviewRequestService, ReviewRequest } from '../../services/review-request.service';
import { ReviewsFolderService, Review } from '../../services/reviews-folder.service';
import { ScrollTargetService } from '../../services/scroll-target.service';

/**
 * Reviews Management Page Component
 * Main page for managing reviews based on source folder selection
 * Coordinates folder selection, review table, and review form
 */
@Component({
  selector: 'app-reviews-management',
  standalone: true,
  imports: [
    CommonModule,
    FolderSelectorComponent,
    ReviewsTableComponent,
    ReviewFormComponent
  ],
  templateUrl: './reviews-management.component.html',
  styleUrls: ['./reviews-management.component.scss']
})
export class ReviewsManagementComponent implements OnInit, OnChanges, OnDestroy {
  @Input() reviewRequest: ReviewRequest | null = null;
  @ViewChild(ReviewsTableComponent) reviewsTableComponent: ReviewsTableComponent | undefined;
  
  selectedSourceFolder: string | null = null;
  currentStep: 'folder-selection' | 'reviews-table' | 'review-form' = 'folder-selection';
  editingReview: Review | null = null;
  selectedReviewSource: 'artist_gallery' | 'prompt_grouping' = 'artist_gallery';
  selectedReviewForeignId: string | null = null;
  
  // Track if we're currently handling a review request to prevent subscription interference
  private isHandlingReviewRequest: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private currentSourceFolderService: CurrentSourceFolderService,
    private reviewsFolderService: ReviewsFolderService,
    private reviewRequestService: ReviewRequestService,
    private cdr: ChangeDetectorRef,
    private scrollTargetService: ScrollTargetService
  ) {}

  ngOnInit(): void {
    // If a review request was provided as an input, handle it
    if (this.reviewRequest) {
      this.handleReviewRequest(this.reviewRequest);
    }

    // Subscribe to folder changes from other components (artist gallery, prompt grouping)
    this.currentSourceFolderService.sourceFolder$
      .pipe(takeUntil(this.destroy$))
      .subscribe(folder => {
        if (folder) {
          this.selectedSourceFolder = folder;
          
          // Only reset to reviews-table if we're NOT handling a review request
          // (to prevent interfering with review form display)
          if (!this.isHandlingReviewRequest) {
            this.currentStep = 'reviews-table';
            this.editingReview = null;
          }
          
          localStorage.setItem('selectedSourceFolder', folder);
          
          // Explicitly trigger reload in reviews-table component
          // This ensures the table updates when folder changes from other components
          if (this.reviewsTableComponent && !this.isHandlingReviewRequest) {
            setTimeout(() => {
              this.reviewsTableComponent?.loadReviews();
            }, 0);
          }
        }
      });
    
    // If no review request and no folder selected, start with folder selection
    // This ensures fresh state on page reload instead of showing stale cached reviews
    if (!this.reviewRequest && !this.selectedSourceFolder) {
      this.currentStep = 'folder-selection';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle review request changes (when review request arrives from gallery/grouping)
    
    if (changes['reviewRequest']) {
      if (changes['reviewRequest'].currentValue) {
        const newRequest = changes['reviewRequest'].currentValue as ReviewRequest;
        this.handleReviewRequest(newRequest);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handle folder selection
   */
  onFolderSelected(folderPath: string): void {
    this.selectedSourceFolder = folderPath;
    this.currentSourceFolderService.setSourceFolder(folderPath);
    this.currentStep = 'reviews-table';
    localStorage.setItem('selectedSourceFolder', folderPath);
  }

  /**
   * Handle review edit from table
   */
  onEditReview(review: Review): void {
    this.editingReview = review;
    this.selectedReviewSource = review.source as 'artist_gallery' | 'prompt_grouping';
    this.selectedReviewForeignId = review.foreign_id;
    this.currentStep = 'review-form';
  }

  /**
   * Handle review saved from form
   */
  onReviewSaved(savedReview: Review): void {
    this.editingReview = null;
    this.currentStep = 'reviews-table';
    
    // Set the scroll target so the table will auto-scroll to this review
    this.scrollTargetService.setScrollTarget(savedReview.id);
    
    // Reload the reviews table to show the updated/new review
    if (this.reviewsTableComponent) {
      this.reviewsTableComponent.loadReviews();
    }
    
    // Clear the pending review request after successful save
    this.reviewRequestService.clearRequest();
  }

  /**
   * Handle form cancelled
   */
  onFormCancelled(): void {
    this.editingReview = null;
    this.currentStep = 'reviews-table';
    // Clear the pending review request so it doesn't persist when user navigates back
    this.reviewRequestService.clearRequest();
  }

  /**
   * Change folder selection
   */
  onChangeFolder(): void {
    this.currentStep = 'folder-selection';
    this.editingReview = null;
  }

  /**
   * Load existing review from source + foreignId (for edit requests from gallery/grouping)
   */
  private loadExistingReview(sourceFolder: string, source: string, foreignId: string): void {
    
    this.reviewsFolderService.getReviewBySource(sourceFolder, source, foreignId).subscribe({
      next: (response) => {
        
        if (response.success && response.review) {
          this.editingReview = response.review;
        } else {
          this.editingReview = null;
        }
        
        // Force change detection after async operation
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.editingReview = null;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Handle review request (extract common logic for both ngOnInit and ngOnChanges)
   */
  private handleReviewRequest(request: ReviewRequest): void {
    
    // Set flag to prevent folder subscription from interfering
    this.isHandlingReviewRequest = true;
    
    this.selectedSourceFolder = request.sourceFolder;
    this.selectedReviewSource = request.source;
    this.selectedReviewForeignId = request.foreignId;
    
    this.currentSourceFolderService.setSourceFolder(request.sourceFolder);
    
    // Set step before loading review
    this.currentStep = 'review-form';
    
    // Force initial change detection for UI update
    this.cdr.markForCheck();
    
    // Load existing review if it exists
    this.loadExistingReview(request.sourceFolder, request.source, request.foreignId);
    
    // Reset flag after a brief delay to allow the form to settle
    setTimeout(() => {
      this.isHandlingReviewRequest = false;
    }, 500);
  }
}
