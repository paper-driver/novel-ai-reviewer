import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ReviewRating {
  anatomy?: number;
  face?: number;
  object?: number;
  background?: number;
  character?: number;
}

export interface Review {
  id: string;
  source: 'artist_gallery' | 'prompt_grouping';
  foreign_id: string;
  rating: ReviewRating;
  notes?: string;
  timestamp: string;
  updatedAt?: string;
}

export interface ReviewsListResponse {
  success: boolean;
  sourcePath: string;
  reviews: Review[];
  count: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewsFolderService {
  private apiUrl = 'http://localhost:3001/api/reviews-folder';

  constructor(private http: HttpClient) { }

  /**
   * Load all reviews from a source folder
   */
  loadReviewsFromFolder(sourcePath: string): Observable<ReviewsListResponse> {
    return this.http.get<ReviewsListResponse>(`${this.apiUrl}/list`, {
      params: { 
        sourcePath,
        v: Date.now().toString() // Cache busting
      }
    });
  }

  /**
   * Create a new review
   */
  createReview(sourcePath: string, source: string, foreignId: string, rating: ReviewRating, notes?: string): Observable<{ success: boolean; review: Review }> {
    return this.http.post<{ success: boolean; review: Review }>(`${this.apiUrl}/create`, {
      sourcePath,
      source,
      foreign_id: foreignId,
      rating,
      notes
    });
  }

  /**
   * Update an existing review
   */
  updateReview(sourcePath: string, reviewId: string, rating?: ReviewRating, notes?: string): Observable<{ success: boolean; review: Review }> {
    return this.http.put<{ success: boolean; review: Review }>(`${this.apiUrl}/update/${reviewId}`, {
      sourcePath,
      rating,
      notes
    });
  }

  /**
   * Delete a review
   */
  deleteReview(sourcePath: string, reviewId: string): Observable<{ success: boolean; deletedReview: Review }> {
    return this.http.delete<{ success: boolean; deletedReview: Review }>(`${this.apiUrl}/delete/${reviewId}`, {
      params: { sourcePath }
    });
  }

  /**
   * Get review by source and foreign_id
   */
  getReviewBySource(sourcePath: string, source: string, foreignId: string): Observable<{ success: boolean; review: Review | null }> {
    return this.http.get<{ success: boolean; review: Review | null }>(`${this.apiUrl}/get-by-source`, {
      params: { sourcePath, source, foreign_id: foreignId }
    });
  }

  /**
   * Check if review file exists in source folder
   */
  checkReviewFileExists(sourcePath: string): Observable<{ success: boolean; sourcePath: string; hasReviewFile: boolean }> {
    return this.http.post<{ success: boolean; sourcePath: string; hasReviewFile: boolean }>(`${this.apiUrl}/check-exists`, {
      sourcePath
    });
  }
}
