import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtistGroupingComponent } from './components/artist-grouping/artist-grouping.component';
import { ArtistGalleryComponent } from './components/artist-gallery/artist-gallery.component';
import { PromptGroupingComponent } from './components/prompt-grouping/prompt-grouping.component';
import { FloatingStatsComponent } from './components/floating-stats/floating-stats.component';
import { ReviewsManagementComponent } from './components/reviews-management/reviews-management.component';
import { FloatingNavComponent } from './components/floating-nav/floating-nav.component';
import { ArtistRegistryComponent } from './components/artist-registry/artist-registry.component';
import { CombinationGeneratorComponent } from './components/combination-generator/combination-generator.component';
import { ReviewRequestService, ReviewRequest } from './services/review-request.service';
import { ScrollTargetService } from './services/scroll-target.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ArtistGroupingComponent,
    ArtistGalleryComponent,
    PromptGroupingComponent,
    FloatingStatsComponent,
    ReviewsManagementComponent,
    FloatingNavComponent,
    ArtistRegistryComponent,
    CombinationGeneratorComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  filters: any = {};
  currentTab: 'reviews-management' | 'grouping' | 'gallery' | 'prompt-grouping' | 'artist-registry' | 'combination-generator' = 'reviews-management';
  
  // Review request from gallery/grouping components
  pendingReviewRequest: ReviewRequest | null = null;
  
  // Store scroll positions for each tab
  private scrollPositions: Map<string, number> = new Map();
  
  // Flag to check if we should prevent scroll restoration (when auto-scrolling to a review)
  private preventScrollRestoration = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private reviewRequestService: ReviewRequestService,
    private scrollTargetService: ScrollTargetService
  ) {}

  ngOnInit(): void {
    // Listen for scroll target updates to prevent scroll restoration during auto-scroll
    this.scrollTargetService.shouldPreventRestoration()
      .pipe(takeUntil(this.destroy$))
      .subscribe(shouldPrevent => {
        this.preventScrollRestoration = shouldPrevent;
      });

    // Listen for review requests from artist gallery or prompt grouping
    this.reviewRequestService.reviewRequest$
      .pipe(takeUntil(this.destroy$))
      .subscribe(request => {
        if (request) {
          this.pendingReviewRequest = request;
          // Save current scroll position before switching
          this.scrollPositions.set(this.currentTab, window.scrollY);
          // Switch to reviews-management tab with the review request data
          this.currentTab = 'reviews-management';
          // Scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          // Clear pending review request when service clears it
          this.pendingReviewRequest = null;
        }
      });
    
    // Listen for scroll events to save scroll position
    window.addEventListener('scroll', () => {
      // Update the current tab's scroll position in the map (throttled to avoid excessive updates)
      this.scrollPositions.set(this.currentTab, window.scrollY);
    });
  }

  /**
   * Handle tab changes from floating navigation
   */
  onTabChange(tabId: 'reviews-management' | 'grouping' | 'gallery' | 'prompt-grouping' | 'artist-registry' | 'combination-generator'): void {
    // Save current scroll position before switching tabs
    this.scrollPositions.set(this.currentTab, window.scrollY);
    
    // Switch to new tab
    this.currentTab = tabId;
    
    // If we're in the middle of auto-scrolling to a review, skip scroll restoration
    if (this.preventScrollRestoration) {
      return;
    }
    
    // Restore previous scroll position or go to top if first visit
    const previousScrollPos = this.scrollPositions.get(tabId);
    
    // Add a small delay to ensure DOM has fully updated with new data
    // This is especially important when returning from review creation where data changes
    setTimeout(() => {
      if (previousScrollPos !== undefined && previousScrollPos > 0) {
        // Restore previous scroll position (wait for DOM to update first)
        window.scrollTo({ top: previousScrollPos, behavior: 'auto' });
      } else {
        // First time visiting this tab, scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // No need to remove scroll listener as component is global
  }
}