import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ReviewRequest {
  sourceFolder: string;
  source: 'artist_gallery' | 'prompt_grouping';
  foreignId: string;
  title: string; // For display: artist names or group ID
}

/**
 * Service to manage review requests from gallery and grouping components
 * Allows these components to request that reviews be opened for a specific source
 */
@Injectable({
  providedIn: 'root'
})
export class ReviewRequestService {
  private reviewRequestSubject = new BehaviorSubject<ReviewRequest | null>(null);
  public reviewRequest$ = this.reviewRequestSubject.asObservable();

  constructor() {}

  /**
   * Trigger a review request (called from artist-gallery or prompt-grouping)
   */
  requestReview(request: ReviewRequest): void {
    console.log('[ReviewRequestService] Review requested:', request);
    this.reviewRequestSubject.next(request);
  }

  /**
   * Clear the review request
   */
  clearRequest(): void {
    this.reviewRequestSubject.next(null);
  }
}
