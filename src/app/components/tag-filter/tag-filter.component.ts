import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TagChipComponent } from '../tag-chip/tag-chip.component';

/**
 * Tag Filter Component
 * Allows users to filter reviews by one or more tags
 * Supports AND logic - reviews must have ALL selected tags
 */
@Component({
  selector: 'app-tag-filter',
  standalone: true,
  imports: [CommonModule, TagChipComponent],
  template: `
    <div class="tag-filter">
      <div class="filter-header">
        <h4>Filter by Tags</h4>
        <button 
          *ngIf="selectedTags.length > 0" 
          class="btn-clear-filters"
          (click)="clearFilters()"
          title="Clear all tag filters"
        >
          Clear Filters
        </button>
      </div>

      <!-- Available Tags to Select -->
      <div class="tags-selection">
        <div class="tags-grid">
          <label *ngFor="let tag of availableTags" class="tag-checkbox">
            <input 
              type="checkbox" 
              [checked]="isTagSelected(tag.id)"
              (change)="toggleTagFilter(tag.id)"
              [disabled]="isLoading"
            />
            <span class="checkbox-label">
              <app-tag-chip [tag]="tag" [removable]="false"></app-tag-chip>
            </span>
          </label>
        </div>

        <div *ngIf="availableTags.length === 0" class="empty-state">
          No tags available yet
        </div>
      </div>

      <!-- Selected Tags Display -->
      <div *ngIf="selectedTags.length > 0" class="selected-tags">
        <p class="selected-label">Selected ({{ selectedTags.length }}):</p>
        <div class="selected-tags-list">
          <app-tag-chip 
            *ngFor="let tag of selectedTags" 
            [tag]="tag" 
            [removable]="true"
            (remove)="toggleTagFilter($event)"
          ></app-tag-chip>
        </div>
      </div>

      <!-- Results Count -->
      <div *ngIf="selectedTags.length > 0" class="filter-info">
        Showing {{ resultCount }} review{{ resultCount !== 1 ? 's' : '' }} with {{ selectedTags.length }} tag{{ selectedTags.length !== 1 ? 's' : '' }}
      </div>
    </div>
  `,
  styles: [`
    .tag-filter {
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      margin: 16px 0;
    }

    .filter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 12px;
    }

    .filter-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .btn-clear-filters {
      background-color: #ff9800;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-weight: 600;
    }

    .btn-clear-filters:hover {
      background-color: #f57c00;
    }

    .tags-selection {
      margin-bottom: 16px;
    }

    .tags-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }

    .tag-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .tag-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }

    .tag-checkbox input[type="checkbox"]:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
    }

    .empty-state {
      color: #999;
      font-size: 13px;
      padding: 20px;
      text-align: center;
    }

    .selected-tags {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .selected-label {
      margin: 0 0 8px 0;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .selected-tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .filter-info {
      margin-top: 12px;
      font-size: 12px;
      color: #666;
      font-style: italic;
    }
  `]
})
export class TagFilterComponent implements OnInit {
  @Input() sourcePath!: string;
  @Input() resultCount: number = 0;
  @Output() filtersChanged = new EventEmitter<string[]>();

  availableTags: any[] = [];
  selectedTags: any[] = [];
  isLoading: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAvailableTags();
  }

  /**
   * Load all available tags for the source folder
   */
  loadAvailableTags(): void {
    if (!this.sourcePath) {
      return;
    }

    this.isLoading = true;
    this.http.get<any>('http://localhost:3001/api/tags/list', {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        this.availableTags = response.tags || [];
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load tags:', err);
        this.isLoading = false;
      }
    });
  }

  /**
   * Toggle a tag in the filter selection
   */
  toggleTagFilter(tagId: string): void {
    const index = this.selectedTags.findIndex(t => t.id === tagId);
    if (index > -1) {
      this.selectedTags.splice(index, 1);
    } else {
      const tag = this.availableTags.find(t => t.id === tagId);
      if (tag) {
        this.selectedTags.push(tag);
      }
    }

    this.filtersChanged.emit(this.selectedTags.map(t => t.id));
  }

  /**
   * Check if a tag is currently selected
   */
  isTagSelected(tagId: string): boolean {
    return this.selectedTags.some(t => t.id === tagId);
  }

  /**
   * Clear all tag filters
   */
  clearFilters(): void {
    this.selectedTags = [];
    this.filtersChanged.emit([]);
  }
}
