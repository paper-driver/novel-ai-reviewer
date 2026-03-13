import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Shared service to notify components when ratings have been saved.
 * This allows artist-gallery and prompt-grouping to stay in sync when ratings change.
 */
@Injectable({
  providedIn: 'root'
})
export class RatingsStateService {
  
  // Emits whenever ratings are saved in any component
  // Contains: { folder: string, ratings: { [filename: string]: number } }
  private ratingsUpdatedSubject = new Subject<{ folder: string; ratings: { [filename: string]: number } }>();
  
  // Public observable for components to subscribe to
  ratingsUpdated$ = this.ratingsUpdatedSubject.asObservable();

  constructor() {}

  /**
   * Call this after successfully saving ratings to notify other components
   */
  notifyRatingsSaved(folder: string, ratings: { [filename: string]: number }): void {
    console.log('[RatingsStateService] Broadcasting ratings update for folder:', folder);
    this.ratingsUpdatedSubject.next({ folder, ratings });
  }
}
