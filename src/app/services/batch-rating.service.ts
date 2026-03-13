import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil, switchMap, tap } from 'rxjs/operators';

export interface BatchRatingJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalImages: number;
  processedImages: number;
  createdAt: Date;
  completedAt?: Date;
  results?: { [filename: string]: number };
  error?: string;
  folderPath?: string;
}

export interface BatchProgress {
  jobId: string;
  totalImages: number;
  processedImages: number;
  percentComplete: number;
  status: string;
  estimatedTimeRemaining: number;
}

@Injectable({
  providedIn: 'root'
})
export class BatchRatingService {
  private progressSubject = new Subject<BatchProgress>();
  public progress$ = this.progressSubject.asObservable();

  private destroy$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  /**
   * Submit a batch of illustrations for AI analysis
   * Uses Google Cloud Vision Batch API (async)
   * Returns job ID for tracking progress
   */
  submitBatchRatingJob(
    folderPath: string,
    imageFilenames: string[]
  ): Observable<{ jobId: string; estimatedTime: string }> {
    console.log(`[BatchRating] Submitting batch job for ${imageFilenames.length} images`);
    
    return this.http.post<{ jobId: string; estimatedTime: string }>(
      'http://localhost:3000/api/batch-rating/submit',
      {
        folderPath,
        imageFilenames,
        analysisType: 'illustration-quality'
      }
    );
  }

  /**
   * Get status and progress of a batch job
   * Poll this to track progress
   */
  getBatchJobStatus(jobId: string): Observable<BatchRatingJob> {
    return this.http.get<BatchRatingJob>(
      `http://localhost:3000/api/batch-rating/status/${jobId}`
    );
  }

  /**
   * Get all active jobs for the user
   */
  getActiveJobs(): Observable<BatchRatingJob[]> {
    return this.http.get<BatchRatingJob[]>(
      'http://localhost:3000/api/batch-rating/jobs'
    );
  }

  /**
   * Cancel a running batch job
   */
  cancelBatchJob(jobId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `http://localhost:3000/api/batch-rating/cancel/${jobId}`,
      {}
    );
  }

  /**
   * Get results of a completed batch job
   */
  getBatchResults(jobId: string): Observable<{ [filename: string]: number }> {
    return this.http.get<{ [filename: string]: number }>(
      `http://localhost:3000/api/batch-rating/results/${jobId}`
    );
  }

  /**
   * Poll job status with automatic retries
   * Emits progress updates as they're available
   */
  pollBatchProgress(jobId: string, intervalMs: number = 5000): Observable<BatchProgress> {
    return new Observable(observer => {
      let pollCount = 0;
      const maxPolls = 360; // 30 minutes with 5s interval

      const poll = () => {
        if (pollCount >= maxPolls) {
          observer.error(new Error('Batch job polling timeout'));
          return;
        }

        this.getBatchJobStatus(jobId).subscribe({
          next: (job) => {
            const percentComplete = (job.processedImages / job.totalImages) * 100;
            const progress: BatchProgress = {
              jobId,
              totalImages: job.totalImages,
              processedImages: job.processedImages,
              percentComplete: Math.round(percentComplete),
              status: job.status,
              estimatedTimeRemaining: this.estimateTimeRemaining(
                job.processedImages,
                job.totalImages,
                pollCount
              )
            };

            observer.next(progress);

            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
              observer.complete();
            } else {
              setTimeout(poll, intervalMs);
            }
          },
          error: (err) => {
            observer.error(err);
          }
        });

        pollCount++;
      };

      poll();
    });
  }

  private estimateTimeRemaining(processed: number, total: number, pollCount: number): number {
    if (processed === 0) return 0;
    const avgTimePerImage = (pollCount * 5) / processed; // seconds per image
    return Math.round((total - processed) * avgTimePerImage);
  }
}
