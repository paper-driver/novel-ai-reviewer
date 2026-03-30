import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TagChipComponent } from '../tag-chip/tag-chip.component';

interface Tag {
  id: string;
  name: string;
  color: string;
}

@Component({
  selector: 'app-image-tags',
  standalone: true,
  imports: [CommonModule, TagChipComponent],
  template: `
    <div class="image-tags-container">
      <h4>Image Tags</h4>
      
      <!-- Error message -->
      <div *ngIf="error" class="error-message">
        ❌ {{ error }}
      </div>

      <!-- Loading state -->
      <div *ngIf="isLoading" class="loading-state">
        ⏳ Loading tags...
      </div>

      <!-- Current tags -->
      <div *ngIf="!isLoading && currentImageTags.length > 0" class="current-tags-section">
        <label class="section-label">Current Tags ({{ currentImageTags.length }})</label>
        <div class="tags-list">
          <app-tag-chip
            *ngFor="let tag of currentImageTags"
            [tag]="tag"
            [removable]="true"
            (remove)="onTagRemoved($event)"
          ></app-tag-chip>
        </div>
      </div>

      <!-- No tags message -->
      <div *ngIf="!isLoading && currentImageTags.length === 0" class="no-tags">
        <p>No tags assigned yet</p>
      </div>

      <!-- Available tags to add (collapsible) -->
      <div *ngIf="!isLoading && availableTagsToAdd.length > 0" class="available-tags-section">
        <div class="section-header">
          <label class="section-label">Add Tags</label>
          <button class="btn-toggle-section" (click)="toggleAddTagsSection()" [title]="showAddTagsSection ? 'Collapse' : 'Expand'">
            {{ showAddTagsSection ? '▼' : '▶' }}
          </button>
        </div>
        <div *ngIf="showAddTagsSection" class="tags-list">
          <button
            *ngFor="let tag of availableTagsToAdd"
            class="btn-add-tag"
            [style.backgroundColor]="tag.color"
            [style.color]="getTextColor(tag.color)"
            (click)="onTagAdded(tag.id)"
            title="Add tag"
          >
            + {{ tag.name }}
          </button>
        </div>
      </div>

      <!-- All tags loaded -->
      <div *ngIf="!isLoading && availableTagsToAdd.length === 0 && allTags.length > 0" class="all-tags-assigned">
        <p>✓ All tags are already assigned</p>
      </div>

      <!-- No tags created -->
      <div *ngIf="!isLoading && allTags.length === 0" class="no-tags-available">
        <p>No tags created yet. Create a tag first to assign it to images.</p>
      </div>
    </div>
  `,
  styles: [`
    .image-tags-container {
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background-color: #fafafa;
    }

    h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .error-message {
      padding: 8px;
      margin-bottom: 12px;
      background-color: #ffebee;
      color: #c62828;
      border-radius: 4px;
      font-size: 12px;
    }

    .loading-state {
      padding: 8px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }

    .current-tags-section,
    .available-tags-section {
      margin-bottom: 16px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .section-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      margin: 0;
    }

    .btn-toggle-section {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      color: #666;
      padding: 0;
      margin: 0;
      transition: color 0.2s;

      &:hover {
        color: #333;
      }
    }

    .tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .btn-add-tag {
      padding: 6px 12px;
      border: none;
      border-radius: 16px;
      background-color: white;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .btn-add-tag:hover {
      opacity: 0.85;
      transform: scale(1.05);
    }

    .no-tags,
    .all-tags-assigned,
    .no-tags-available {
      padding: 12px;
      text-align: center;
      color: #999;
      font-size: 12px;
      font-style: italic;
    }
  `]
})
export class ImageTagsComponent implements OnInit, OnChanges {
  @Input() sourcePath: string = '';
  @Input() imageFilename: string = '';
  @Output() tagsChanged = new EventEmitter<string[]>();

  allTags: Tag[] = [];
  currentImageTagIds: string[] = [];
  isLoading: boolean = false;
  error: string = '';
  showAddTagsSection: boolean = false; // Collapsed by default

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    console.log('[ImageTags] ngOnInit - sourcePath:', this.sourcePath, 'imageFilename:', this.imageFilename);
    this.loadTags();
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('[ImageTags] ngOnChanges - changes:', changes);
    if (changes['sourcePath'] || changes['imageFilename']) {
      console.log('[ImageTags] sourcePath or imageFilename changed, reloading tags');
      this.loadTags();
    }
  }

  /**
   * Load all available tags for the source folder
   */
  private loadTags(): void {
    console.log('[ImageTags] loadTags - sourcePath:', this.sourcePath, 'imageFilename:', this.imageFilename);
    if (!this.sourcePath || !this.imageFilename) {
      this.error = 'Missing sourcePath or imageFilename';
      console.warn('[ImageTags] Missing sourcePath or imageFilename:', { sourcePath: this.sourcePath, imageFilename: this.imageFilename });
      return;
    }

    this.isLoading = true;
    this.error = '';

    const tagListUrl = `http://localhost:3001/api/tags/list?sourcePath=${encodeURIComponent(this.sourcePath)}`;
    console.log('[ImageTags] Fetching tags from:', tagListUrl);
    
    this.http.get<any>(tagListUrl).subscribe({
      next: (response) => {
        console.log('[ImageTags] Tags API response:', response);
        this.allTags = response.tags || [];
        console.log('[ImageTags] Loaded', this.allTags.length, 'tags');
        this.loadImageTags();
      },
      error: (err) => {
        this.error = 'Failed to load tags';
        this.isLoading = false;
        console.error('[ImageTags] Error loading tags:', err);
      }
    });
  }

  /**
   * Load tags for the specific image
   */
  private loadImageTags(): void {
    const basename = this.imageFilename.includes('/') 
      ? this.imageFilename.split('/').pop()! 
      : this.imageFilename;

    const imageTagsUrl = `http://localhost:3001/api/tags/images/get-tags?sourcePath=${encodeURIComponent(this.sourcePath)}&imageFilename=${encodeURIComponent(basename)}`;
    console.log('[ImageTags] Fetching image-specific tags from:', imageTagsUrl);
    
    this.http.get<any>(imageTagsUrl).subscribe({
      next: (response) => {
        console.log('[ImageTags] Image tags API response:', response);
        this.currentImageTagIds = response.tagIds || [];
        this.isLoading = false;
        console.log('[ImageTags] Loaded image tags for', basename, ':', this.currentImageTagIds);
      },
      error: (err) => {
        this.error = 'Failed to load image tags';
        this.isLoading = false;
        console.error('[ImageTags] Error loading image tags:', err);
      }
    });
  }

  /**
   * Get full tag details for currently assigned tags
   */
  get currentImageTags(): Tag[] {
    return this.allTags.filter(tag => this.currentImageTagIds.includes(tag.id));
  }

  /**
   * Get tags that aren't yet assigned to this image
   */
  get availableTagsToAdd(): Tag[] {
    return this.allTags.filter(tag => !this.currentImageTagIds.includes(tag.id));
  }

  /**
   * Handle adding a tag to the image
   */
  onTagAdded(tagId: string): void {
    const basename = this.imageFilename.includes('/') 
      ? this.imageFilename.split('/').pop()! 
      : this.imageFilename;

    this.http.post<any>(
      'http://localhost:3001/api/tags/images/add-tag',
      {
        sourcePath: this.sourcePath,
        imageFilename: basename,
        tagId: tagId
      }
    ).subscribe({
      next: (response) => {
        this.currentImageTagIds = response.tags;
        this.tagsChanged.emit(this.currentImageTagIds);
        this.error = '';
        console.log('[ImageTags] Added tag:', tagId);
      },
      error: (err) => {
        this.error = 'Failed to add tag';
        console.error('[ImageTags] Error adding tag:', err);
      }
    });
  }

  /**
   * Handle removing a tag from the image
   */
  onTagRemoved(tagId: string): void {
    const basename = this.imageFilename.includes('/') 
      ? this.imageFilename.split('/').pop()! 
      : this.imageFilename;

    this.http.delete<any>(
      'http://localhost:3001/api/tags/images/remove-tag',
      {
        body: {
          sourcePath: this.sourcePath,
          imageFilename: basename,
          tagId: tagId
        }
      }
    ).subscribe({
      next: (response) => {
        this.currentImageTagIds = response.tags;
        this.tagsChanged.emit(this.currentImageTagIds);
        this.error = '';
        console.log('[ImageTags] Removed tag:', tagId);
      },
      error: (err) => {
        this.error = 'Failed to remove tag';
        console.error('[ImageTags] Error removing tag:', err);
      }
    });
  }

  /**
   * Toggle the "Add Tags" section visibility
   */
  toggleAddTagsSection(): void {
    this.showAddTagsSection = !this.showAddTagsSection;
  }

  /**
   * Determine text color (light or dark) based on background color brightness
   * Ensures good contrast for readability
   */
  getTextColor(hexColor: string): string {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Convert hex to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black text for light backgrounds, white for dark
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }
}
