import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BatchRatingService, BatchRatingJob, BatchProgress } from '../../services/batch-rating.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-batch-rating-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './batch-rating-manager.component.html',
  styleUrls: ['./batch-rating-manager.component.scss']
})
export class BatchRatingManagerComponent implements OnInit, OnDestroy {
  activeJobs: BatchRatingJob[] = [];
  currentJobProgress: BatchProgress | null = null;
  currentJobId: string = '';
  isPolling: boolean = false;
  private destroy$ = new Subject<void>();

  constructor(private batchRatingService: BatchRatingService) {}

  ngOnInit() {
    this.loadActiveJobs();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load list of active/pending batch jobs
   */
  loadActiveJobs() {
    this.batchRatingService.getActiveJobs()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (jobs) => {
          this.activeJobs = jobs;
          console.log(`[BatchManager] Loaded ${jobs.length} active jobs`);
        },
        error: (err) => {
          console.error('[BatchManager] Failed to load jobs:', err);
        }
      });
  }

  /**
   * Submit new batch job from modal
   * Called from image-viewer-modal when user clicks "Batch Rate All"
   */
  submitNewBatchJob(folderPath: string, imageFilenames: string[]) {
    console.log(`[BatchManager] Submitting batch job for ${imageFilenames.length} images`);

    this.batchRatingService.submitBatchRatingJob(folderPath, imageFilenames)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const jobId = response.jobId;
          this.currentJobId = jobId;

          console.log(`[BatchManager] Job submitted! ID: ${jobId}`);
          console.log(`[BatchManager] Estimated time: ${response.estimatedTime}`);

          // Start polling for progress
          this.startPolling(jobId);

          // Add to active jobs list
          this.loadActiveJobs();
        },
        error: (err) => {
          console.error('[BatchManager] Failed to submit batch job:', err);
        }
      });
  }

  /**
   * Start polling job progress
   */
  startPolling(jobId: string) {
    if (this.isPolling) {
      console.warn('[BatchManager] Already polling a job');
      return;
    }

    this.isPolling = true;
    console.log(`[BatchManager] Starting progress polling for job: ${jobId}`);

    this.batchRatingService.pollBatchProgress(jobId, 5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress) => {
          this.currentJobProgress = progress;
          console.log(
            `[BatchManager] Progress: ${progress.processedImages}/${progress.totalImages} ` +
            `(${progress.percentComplete}%) - ETA: ${progress.estimatedTimeRemaining}s`
          );
        },
        complete: () => {
          console.log(`[BatchManager] Job completed!`);
          this.isPolling = false;
          this.loadActiveJobs();
          this.currentJobProgress = null;
        },
        error: (err) => {
          console.error('[BatchManager] Polling error:', err);
          this.isPolling = false;
        }
      });
  }

  /**
   * Cancel a running batch job
   */
  cancelJob(jobId: string) {
    this.batchRatingService.cancelBatchJob(jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            console.log(`[BatchManager] Job ${jobId} cancelled`);
            this.isPolling = false;
            this.currentJobProgress = null;
            this.loadActiveJobs();
          }
        },
        error: (err) => {
          console.error('[BatchManager] Failed to cancel job:', err);
        }
      });
  }

  /**
   * Get results of completed job
   */
  getJobResults(jobId: string) {
    this.batchRatingService.getBatchResults(jobId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          console.log(`[BatchManager] Got results for job ${jobId}:`, results);
        },
        error: (err) => {
          console.error('[BatchManager] Failed to get results:', err);
        }
      });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '#6bcf7f';
      case 'processing': return '#667eea';
      case 'pending': return '#ffd93d';
      case 'failed': return '#ff6b6b';
      case 'cancelled': return '#aaa';
      default: return '#aaa';
    }
  }
}
