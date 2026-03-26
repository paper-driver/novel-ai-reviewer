import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CurrentSourceFolderService } from '../../services/current-source-folder.service';

export interface CorrectionStats {
  totalCorrections: number;
  averageCorrection: number;
  positiveCorrections: number;  // User rated higher than AI
  negativeCorrections: number;  // User rated lower than AI
  byComponent: {
    [key: string]: {
      count: number;
      averageCorrection: number;
      min: number;
      max: number;
    }
  };
  sourceFolder: string;
}

@Component({
  selector: 'app-ai-corrections-widget',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './ai-corrections-widget.component.html',
  styleUrls: ['./ai-corrections-widget.component.scss']
})
export class AiCorrectionsWidgetComponent implements OnInit, OnDestroy {
  isCollapsed: boolean = true;
  stats: CorrectionStats | null = null;
  isLoading: boolean = false;
  error: string | null = null;
  
  private destroy$ = new Subject<void>();
  private autoRefreshInterval = 30000; // Refresh every 30 seconds
  currentSourceFolder: string | null = null;

  constructor(
    private http: HttpClient,
    private currentSourceFolderService: CurrentSourceFolderService
  ) {}

  ngOnInit() {
    // Check initial source folder
    const initialFolder = this.currentSourceFolderService.getSourceFolder();
    if (initialFolder) {
      this.currentSourceFolder = initialFolder;
      this.loadStats();
    }
    
    // Subscribe to source folder changes
    this.currentSourceFolderService.sourceFolder$
      .pipe(takeUntil(this.destroy$))
      .subscribe(folder => {
        this.currentSourceFolder = folder;
        // Load stats whenever source folder changes
        if (folder) {
          this.loadStats();
        } else {
          this.error = 'No source folder selected. Please select a folder to see analytics.';
        }
      });
    
    // Auto-refresh stats every 30 seconds
    interval(this.autoRefreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.currentSourceFolder) {
          this.loadStats();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load correction statistics from backend
   */
  loadStats(): void {
    if (!this.currentSourceFolder) {
      this.error = 'No source folder selected. Please select a folder to see analytics.';
      return;
    }

    this.isLoading = true;
    this.error = null;

    const url = `http://localhost:3001/api/feedback/stats?sourcePath=${encodeURIComponent(this.currentSourceFolder)}`;

    this.http.get<{ success: boolean; stats: CorrectionStats; error?: string }>(url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.stats = response.stats;
          } else {
            this.error = response.error || 'Failed to load statistics';
          }
          this.isLoading = false;
        },
        error: (err) => {
          this.error = 'Error loading statistics: ' + (err.error?.error || err.message);
          this.isLoading = false;
        }
      });
  }

  /**
   * Toggle collapse/expand state
   */
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  /**
   * Format correction value for display
   */
  formatCorrection(value: number): string {
    if (value > 0) {
      return `+${value.toFixed(2)}`;
    } else if (value < 0) {
      return `${value.toFixed(2)}`;
    } else {
      return '0.00';
    }
  }

  /**
   * Get correction direction label
   */
  getCorrectionLabel(value: number): string {
    if (value > 0) {
      return 'Upgraded ↑';
    } else if (value < 0) {
      return 'Downgraded ↓';
    } else {
      return 'Neutral';
    }
  }

  /**
   * Get CSS class for correction direction
   */
  getCorrectionClass(value: number): string {
    if (value > 0.1) {
      return 'positive';
    } else if (value < -0.1) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  /**
   * Refresh stats manually
   */
  refresh(): void {
    this.loadStats();
  }
}
