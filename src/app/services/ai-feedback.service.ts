import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AiFeedbackService {
  private apiUrl = 'http://localhost:3001/api/feedback';

  constructor(private http: HttpClient) { }

  /**
   * Submit user feedback for an image
   */
  submitFeedback(feedback: {
    imageId: string;
    aiScore: number;
    userScore: number;
    reasoning: string;
    components: any;
    sourcePath?: string;
  }, sourcePath?: string): Observable<any> {
    const feedbackData = {
      ...feedback,
      sourcePath: sourcePath || feedback.sourcePath
    };
    return this.http.post(`${this.apiUrl}/submit`, feedbackData);
  }

  /**
   * Get feedback analysis
   */
  getAnalysis(sourcePath?: string): Observable<any> {
    const params = sourcePath ? { sourcePath } : {};
    return this.http.get(`${this.apiUrl}/analysis`, { params });
  }

  /**
   * Get all feedback entries
   */
  listFeedback(sourcePath?: string): Observable<any> {
    const params = sourcePath ? { sourcePath } : {};
    return this.http.get(`${this.apiUrl}/list`, { params });
  }

  /**
   * Clear all feedback
   */
  clearFeedback(sourcePath?: string): Observable<any> {
    const params = sourcePath ? { sourcePath } : {};
    return this.http.delete(`${this.apiUrl}/clear`, { params });
  }
}
