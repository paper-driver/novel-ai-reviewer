import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Review {
  id: number;
  prompt: string;
  review: string;
  ratings: {
    handFeet: string;
    facialExpression: string;
    genital: string;
    accessories: string;
    sideCharacter: string;
    background: string;
  };
  folder: string;
  images: string[];
  thumbnail: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private apiUrl = 'http://localhost:3000/api';
  constructor(private http: HttpClient) {}

  /**
   * Create a new review with accompanying images.
   * Uses FormData for multipart submission.
   */
  createReview(formData: FormData): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/reviews`, formData);
  }

  /**
   * Retrieve reviews from the server, optionally filtering by given parameters.
   */
  getReviews(filters?: any): Observable<Review[]> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value) {
          params = params.set(key, value);
        }
      });
    }
    return this.http.get<Review[]>(`${this.apiUrl}/reviews`, { params });
  }

  /**
   * Update an existing review with new data and optional new images.
   * Uses FormData for multipart submission.
   */
  updateReview(id: number, formData: FormData): Observable<Review> {
    return this.http.put<Review>(`${this.apiUrl}/reviews/${id}`, formData);
  }

  /**
   * Delete a review by ID.
   */
  deleteReview(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/reviews/${id}`);
  }
}