import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Service to coordinate auto-scrolling to specific reviews
 * Prevents scroll position memory from interfering with auto-scroll
 */
@Injectable({
  providedIn: 'root'
})
export class ScrollTargetService {
  // The review ID to scroll to (null when no scroll target)
  private scrollTargetId$ = new BehaviorSubject<string | null>(null);
  
  // Flag to prevent scroll position restoration when auto-scrolling
  private preventScrollRestoration$ = new BehaviorSubject<boolean>(false);

  constructor() {}

  /**
   * Set the review ID to scroll to
   * This signals that the next scroll should be to this review, not restored from memory
   */
  setScrollTarget(reviewId: string): void {
    this.scrollTargetId$.next(reviewId);
    // Prevent scroll restoration while we're auto-scrolling
    this.preventScrollRestoration$.next(true);
  }

  /**
   * Get the current scroll target ID
   */
  getScrollTarget() {
    return this.scrollTargetId$.asObservable();
  }

  /**
   * Check if scroll restoration should be prevented
   */
  shouldPreventRestoration() {
    return this.preventScrollRestoration$.asObservable();
  }

  /**
   * Clear the scroll target after scrolling is complete
   */
  clearScrollTarget(): void {
    this.scrollTargetId$.next(null);
    this.preventScrollRestoration$.next(false);
  }
}
