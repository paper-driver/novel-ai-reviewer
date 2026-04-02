import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Observable, interval, Subject } from 'rxjs';
import { takeUntil, switchMap, tap } from 'rxjs/operators';

/**
 * Image Generation Progress Monitor Component
 * Displays real-time progress of image generation jobs
 * Polls status endpoint and shows generated images as they complete
 */
@Component({
  selector: 'app-image-generation-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-generation-progress.component.html',
  styleUrls: ['./image-generation-progress.component.scss']
})
export class ImageGenerationProgressComponent implements OnInit, OnDestroy {
  @Input() jobId: string = '';
  @Input() progress: any = null;
  @Input() results: any = null;

  // Observables
  jobStatus$ = new BehaviorSubject<any>(null);
  isLoading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string | null>(null);
  isCompleted$ = new BehaviorSubject<boolean>(false);

  private destroy$ = new Subject<void>();
  private pollInterval = 2000; // Poll every 2 seconds

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.jobId) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Start polling job status
   */
  private startPolling(): void {
    this.isLoading$.next(true);

    interval(this.pollInterval)
      .pipe(
        switchMap(() => {
          return this.http.get(`/api/image-generation/status/${this.jobId}`);
        }),
        tap((response: any) => {
          this.jobStatus$.next(response);
          this.isLoading$.next(false);

          // Check if job is completed
          if (response.status === 'completed' || response.status === 'completed_with_errors' || response.status === 'failed') {
            this.isCompleted$.next(true);
            this.fetchResults();
            // Stop polling
            this.destroy$.next();
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        error: (error) => {
          this.error$.next(`Failed to fetch status: ${error.message}`);
          this.isLoading$.next(false);
        }
      });
  }

  /**
   * Fetch final results after completion
   */
  private fetchResults(): void {
    this.http.get(`/api/image-generation/results/${this.jobId}`)
      .subscribe({
        next: (results: any) => {
          // Keep the results in jobStatus for display
          this.jobStatus$.next({
            ...this.jobStatus$.value,
            results: results.results,
            generatedImages: results.generatedImages
          });
        },
        error: (error) => {
          this.error$.next(`Failed to fetch results: ${error.message}`);
        }
      });
  }

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'badge-warning';
      case 'generating':
        return 'badge-info';
      case 'analyzing':
        return 'badge-info';
      case 'completed':
        return 'badge-success';
      case 'completed_with_errors':
        return 'badge-warning';
      case 'failed':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  }

  /**
   * Get status display text
   */
  getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return 'Pending...';
      case 'generating':
        return '🎨 Generating Images...';
      case 'analyzing':
        return '📊 Analyzing Images...';
      case 'completed':
        return '✅ Completed';
      case 'completed_with_errors':
        return '⚠️ Completed with Errors';
      case 'failed':
        return '❌ Failed';
      default:
        return status;
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  /**
   * Extract quality score from analysis result
   */
  getQualityScore(analysisResult: any): number | null {
    if (!analysisResult || !analysisResult.score) return null;
    return Math.round(analysisResult.score * 100) / 100;
  }

  /**
   * Get quality badge color
   */
  getQualityBadgeClass(score: number): string {
    if (score >= 0.8) return 'badge-success';
    if (score >= 0.6) return 'badge-info';
    if (score >= 0.4) return 'badge-warning';
    return 'badge-danger';
  }
}
