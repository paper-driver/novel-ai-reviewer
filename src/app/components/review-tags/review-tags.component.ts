import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TagChipComponent } from '../tag-chip/tag-chip.component';

/**
 * Review Tags Component
 * Manages tags for a specific review
 * Allows adding and removing tags from a review
 */
@Component({
  selector: 'app-review-tags',
  standalone: true,
  imports: [CommonModule, FormsModule, TagChipComponent],
  template: `
    <div class="review-tags">
      <div class="tags-header">
        <h4>Review Tags</h4>
        <span class="tag-count">{{ reviewTags.length }}</span>
      </div>

      <!-- Current Tags -->
      <div *ngIf="reviewTags.length > 0" class="current-tags">
        <app-tag-chip 
          *ngFor="let tag of reviewTags" 
          [tag]="tag" 
          [removable]="true"
          (remove)="removeTagFromReview($event)"
        ></app-tag-chip>
      </div>

      <div *ngIf="reviewTags.length === 0" class="no-tags">
        No tags assigned yet
      </div>

      <!-- Available Tags to Add -->
      <div class="add-tags-section">
        <p class="section-label">Available Tags:</p>
        <div class="available-tags">
          <button 
            *ngFor="let tag of availableTagsToAdd" 
            class="tag-add-btn"
            [style.background-color]="tag.color"
            [style.color]="getTextColor(tag.color)"
            (click)="addTagToReview(tag.id)"
            [disabled]="isUpdating"
            type="button"
          >
            + {{ tag.name }}
          </button>

          <div *ngIf="availableTagsToAdd.length === 0" class="empty-tags">
            All tags are assigned or no tags available
          </div>
        </div>
      </div>

      <!-- Create New Tag Section -->
      <div class="create-tag-section">
        <div class="section-header">
          <p class="section-label">Create New Tag</p>
          <button type="button" class="btn-toggle-section" (click)="toggleCreateTagSection()" [title]="showCreateTagSection ? 'Collapse' : 'Expand'">
            {{ showCreateTagSection ? '▼' : '▶' }}
          </button>
        </div>
        <div *ngIf="showCreateTagSection" class="create-form">
          <div class="form-group">
            <input 
              type="text" 
              [(ngModel)]="newTagName"
              [ngModelOptions]="{standalone: true}"
              placeholder="Tag name"
              class="form-input"
              autocomplete="off"
              (keydown.enter)="createAndAddTag()"
            />
          </div>
          <div class="form-group color-group">
            <div class="color-palette">
              <button 
                type="button"
                *ngFor="let color of presetColors"
                [style.background-color]="color"
                [class.selected]="newTagColor === color"
                (click)="newTagColor = color"
                class="color-button"
                title="Quick color"
              ></button>
            </div>
            <input 
              type="color" 
              [(ngModel)]="newTagColor"
              [ngModelOptions]="{standalone: true}"
              class="color-picker"
            />
          </div>
          <button 
            type="button"
            (click)="createAndAddTag()" 
            [disabled]="!newTagName.trim() || isCreatingTag"
            class="btn-create-tag"
          >
            {{ isCreatingTag ? '⏳ Creating...' : '+ Create & Add' }}
          </button>
          <div *ngIf="createTagError" class="create-error-message">
            ❌ {{ createTagError }}
          </div>
        </div>
      </div>

      <!-- Error Messages -->
      <div *ngIf="error" class="error-message">❌ {{ error }}</div>
    </div>
  `,
  styles: [`
    .review-tags {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 6px;
      padding: 16px;
      margin: 12px 0;
    }

    .tags-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid #eee;
    }

    .tags-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .tag-count {
      background-color: #e0e0e0;
      color: #666;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .current-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
      padding: 12px;
      background: white;
      border-radius: 4px;
    }

    .no-tags {
      color: #999;
      font-size: 13px;
      padding: 12px;
      text-align: center;
      margin-bottom: 16px;
      background: white;
      border-radius: 4px;
    }

    .add-tags-section {
      margin-top: 16px;
    }

    .section-label {
      margin: 0 0 8px 0;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .available-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag-add-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
      white-space: nowrap;
    }

    .tag-add-btn:hover:not(:disabled) {
      opacity: 0.85;
      transform: scale(1.05);
    }

    .tag-add-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .empty-tags {
      color: #bbb;
      font-size: 12px;
      padding: 8px;
    }

    .create-tag-section {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .section-header .section-label {
      margin: 0;
      color: #666;
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
    }

    .btn-toggle-section:hover {
      color: #333;
    }

    .create-form {
      margin-top: 8px;
      padding: 10px;
      background-color: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-group {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .form-input {
      padding: 6px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      flex: 1;
      transition: border-color 0.2s;
      background-color: #fff;
      color: #333;
      caret-color: #8bc34a;
    }

    .form-input::placeholder {
      color: #ccc;
    }

    .form-input:focus {
      outline: none;
      border-color: #8bc34a;
      box-shadow: 0 0 3px rgba(139, 195, 74, 0.2);
      background-color: #fafbf8;
    }

    .color-group {
      align-items: center;
    }

    .color-palette {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .color-button {
      width: 24px;
      height: 24px;
      border: 2px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .color-button:hover {
      transform: scale(1.1);
    }

    .color-button.selected {
      border-color: #333;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
    }

    .color-picker {
      width: 40px;
      height: 24px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-create-tag {
      padding: 6px 10px;
      background-color: #8bc34a;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-create-tag:hover:not(:disabled) {
      background-color: #7cb342;
    }

    .btn-create-tag:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .create-error-message {
      color: #d32f2f;
      background-color: #ffebee;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    .error-message {
      color: #d32f2f;
      background-color: #ffebee;
      padding: 10px;
      border-radius: 4px;
      margin-top: 12px;
      font-size: 12px;
    }
  `]
})
export class ReviewTagsComponent implements OnInit, OnChanges {
  @Input() sourcePath!: string;
  @Input() reviewId!: string;
  @Input() imageFilenames: string[] = []; // List of images in this review
  @Input() source: 'artist_gallery' | 'prompt_grouping' = 'artist_gallery'; // Type of source for this review
  @Output() tagsChanged = new EventEmitter<string[]>();

  reviewTags: any[] = [];
  availableTags: any[] = [];
  isUpdating: boolean = false;
  error: string | null = null;

  // Tag creation properties
  newTagName: string = '';
  newTagColor: string = '#6BCB77'; // Default green
  presetColors: string[] = [
    '#FF6B6B',  // Red
    '#FF8C42',  // Orange
    '#FFD93D',  // Yellow
    '#6BCB77',  // Green
    '#4D96FF',  // Blue
    '#9D4EDD',  // Purple
    '#FF006E',  // Pink
    '#00D9FF',  // Cyan
    '#808080',  // Gray
    '#2A2A2A'   // Dark Gray
  ];
  showCreateTagSection: boolean = false; // Collapsed by default
  isCreatingTag: boolean = false;
  createTagError: string = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAvailableTags();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When imageFilenames are provided, load union of image-level tags
    if (this.imageFilenames && this.imageFilenames.length > 0) {
      if ((changes['imageFilenames'] || changes['sourcePath']) && this.availableTags.length > 0) {
        this.loadImageLevelTags();
      }
    } else if (changes['reviewId'] && this.availableTags.length > 0) {
      // Otherwise load review-level tags
      this.loadReviewTagsFromAPI();
    }
  }

  /**
   * Load all available tags for the source folder
   */
  loadAvailableTags(): void {
    if (!this.sourcePath) {
      return;
    }

    this.http.get<any>('http://localhost:3001/api/tags/list', {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        this.availableTags = response.tags || [];
        
        // After available tags are loaded, load review tags
        if (this.imageFilenames && this.imageFilenames.length > 0) {
          this.loadImageLevelTags();
        } else if (this.reviewId) {
          this.loadReviewTagsFromAPI();
        }
      },
      error: (err) => {
        console.error('Failed to load tags:', err);
      }
    });
  }

  /**
   * Load tags for the current review
   */
  loadReviewTags(review: any): void {
    if (review && review.tags && Array.isArray(review.tags)) {
      this.reviewTags = this.availableTags.filter(tag => 
        review.tags.includes(tag.id)
      );
    } else {
      this.reviewTags = [];
    }
  }

  /**
   * Load union of tags for all images in the review
   * Called when imageFilenames are provided (review form context)
   */
  private loadImageLevelTags(): void {
    if (!this.imageFilenames || this.imageFilenames.length === 0 || !this.sourcePath) {
      this.reviewTags = [];
      return;
    }

    // Join filenames with pipe delimiter
    const imageFilenames = this.imageFilenames.join('|');
    
    this.http.get<any>('http://localhost:3001/api/tags/images/union-tags', {
      params: {
        sourcePath: this.sourcePath,
        imageFilenames: imageFilenames
      }
    }).subscribe({
      next: (response) => {
        // Map the returned tags to available tags
        if (response.success && response.tags && Array.isArray(response.tags)) {
          this.reviewTags = response.tags;
          console.log('[ReviewTags] Loaded image-level tags:', this.reviewTags.map((t: any) => t.name));
        } else {
          this.reviewTags = [];
        }
      },
      error: (err) => {
        console.warn('[ReviewTags] Error loading image-level tags:', err);
        this.reviewTags = [];
      }
    });
  }

  /**
   * Load review tags from API for the current reviewId
   */
  private loadReviewTagsFromAPI(): void {
    if (!this.reviewId || !this.sourcePath) {
      return;
    }

    this.http.get<any>(`http://localhost:3001/api/tags/reviews/${this.reviewId}`, {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        if (response.review && response.review.tags && Array.isArray(response.review.tags)) {
          this.reviewTags = this.availableTags.filter(tag => 
            response.review.tags.includes(tag.id)
          );
          console.log('[ReviewTags] Loaded review tags:', this.reviewTags.map(t => t.name));
        } else {
          this.reviewTags = [];
        }
      },
      error: (err) => {
        console.warn('[ReviewTags] Error loading review tags:', err);
        this.reviewTags = [];
      }
    });
  }

  /**
   * Add a tag to the current review AND all images in the review
   */
  addTagToReview(tagId: string): void {
    this.isUpdating = true;
    this.error = null;

    // Add tag to review
    this.http.post<any>(`http://localhost:3001/api/tags/reviews/${this.reviewId}/add/${tagId}`, {}, {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        this.reviewTags = this.availableTags.filter(tag => 
          response.review.tags.includes(tag.id)
        );
        
        // Also add tag to all images in the review
        if (this.imageFilenames.length > 0) {
          this.http.post<any>('http://localhost:3001/api/tags/images/add-to-multiple', {
            sourcePath: this.sourcePath,
            imageFilenames: this.imageFilenames,
            tagId: tagId
          }).subscribe({
            next: () => {
              this.isUpdating = false;
              this.tagsChanged.emit(response.review.tags);
              console.log('[ReviewTags] Tag added to review and all images');
            },
            error: (err) => {
              this.isUpdating = false;
              this.error = err.error?.error || 'Failed to add tag to images';
              console.error('Error adding tag to images:', err);
            }
          });
        } else {
          this.isUpdating = false;
          this.tagsChanged.emit(response.review.tags);
        }
      },
      error: (err) => {
        this.isUpdating = false;
        this.error = err.error?.error || 'Failed to add tag';
        console.error('Error adding tag to review:', err);
      }
    });
  }

  /**
   * Remove a tag from the current review AND all images in the review
   */
  removeTagFromReview(tagId: string): void {
    this.isUpdating = true;
    this.error = null;

    // Remove tag from review
    this.http.delete<any>(`http://localhost:3001/api/tags/reviews/${this.reviewId}/remove/${tagId}`, {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        this.reviewTags = this.availableTags.filter(tag => 
          response.review.tags.includes(tag.id)
        );
        
        // Also remove tag from all images in the review
        if (this.imageFilenames.length > 0) {
          this.http.delete<any>('http://localhost:3001/api/tags/images/remove-from-multiple', {
            body: {
              sourcePath: this.sourcePath,
              imageFilenames: this.imageFilenames,
              tagId: tagId
            }
          }).subscribe({
            next: () => {
              this.isUpdating = false;
              this.tagsChanged.emit(response.review.tags);
              console.log('[ReviewTags] Tag removed from review and all images');
            },
            error: (err) => {
              this.isUpdating = false;
              this.error = err.error?.error || 'Failed to remove tag from images';
              console.error('Error removing tag from images:', err);
            }
          });
        } else {
          this.isUpdating = false;
          this.tagsChanged.emit(response.review.tags);
        }
      },
      error: (err) => {
        this.isUpdating = false;
        this.error = err.error?.error || 'Failed to remove tag';
        console.error('Error removing tag from review:', err);
      }
    });
  }

  /**
   * Get computed property: tags that can be added (not already assigned)
   */
  get availableTagsToAdd(): any[] {
    const assignedTagIds = this.reviewTags.map(t => t.id);
    return this.availableTags.filter(tag => !assignedTagIds.includes(tag.id));
  }

  /**
   * Toggle the "Create Tag" section visibility
   */
  toggleCreateTagSection(): void {
    this.showCreateTagSection = !this.showCreateTagSection;
    if (!this.showCreateTagSection) {
      this.clearCreateTagForm();
    }
  }

  /**
   * Create a new tag and immediately add it to the current review
   */
  createAndAddTag(): void {
    if (!this.newTagName.trim()) {
      this.createTagError = 'Tag name is required';
      return;
    }

    this.isCreatingTag = true;
    this.createTagError = '';

    this.http.post<any>(
      'http://localhost:3001/api/tags/create',
      {
        sourcePath: this.sourcePath,
        name: this.newTagName.trim(),
        color: this.newTagColor
      }
    ).subscribe({
      next: (response) => {
        console.log('[ReviewTags] Created new tag:', response);
        
        // Extract tag ID from response - response.tag.id or response.id
        const newTag = response.tag || response;
        const newTagId = newTag?.id || newTag?.tagId;
        
        if (!newTagId) {
          this.createTagError = 'Invalid response from server';
          this.isCreatingTag = false;
          console.error('[ReviewTags] Missing tag ID in response:', response);
          return;
        }

        // Reload available tags to get the newly created tag
        this.loadAvailableTags();

        // Auto-add the new tag to the review
        setTimeout(() => {
          this.addTagToReview(newTagId);
          
          // Clear form
          this.clearCreateTagForm();
          this.showCreateTagSection = false;
          this.isCreatingTag = false;
          console.log('[ReviewTags] Tag created and added successfully');
        }, 100);
      },
      error: (err) => {
        console.error('[ReviewTags] Error creating tag:', err);
        
        // If tag already exists, try to find it and use it
        if (err.status === 500 && err.error?.details?.includes('already exists')) {
          console.log('[ReviewTags] Tag already exists, looking for existing tag...');
          
          // Reload available tags first
          this.loadAvailableTags();
          
          setTimeout(() => {
            // Find the tag by name (case-insensitive)
            const existingTag = this.availableTags.find(t => 
              t.name.toLowerCase() === this.newTagName.trim().toLowerCase()
            );
            
            if (existingTag) {
              console.log('[ReviewTags] Found existing tag:', existingTag);
              this.addTagToReview(existingTag.id);
              this.clearCreateTagForm();
              this.showCreateTagSection = false;
              this.isCreatingTag = false;
            } else {
              this.createTagError = 'Tag exists but could not be found';
              this.isCreatingTag = false;
            }
          }, 100);
        } else {
          this.createTagError = err.error?.message || err.error?.details || 'Failed to create tag';
          this.isCreatingTag = false;
        }
      }
    });
  }

  /**
   * Clear the create tag form
   */
  private clearCreateTagForm(): void {
    this.newTagName = '';
    this.newTagColor = '#6BCB77';
    this.createTagError = '';
  }

  /**
   * Determine text color based on background color
   */
  getTextColor(bgColor: string): string {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }
}
