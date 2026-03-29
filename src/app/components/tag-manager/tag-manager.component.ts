import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TagChipComponent } from '../tag-chip/tag-chip.component';

/**
 * Tag Manager Component
 * Allows users to create and delete tags for a source folder
 * Displays all existing tags
 */
@Component({
  selector: 'app-tag-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, TagChipComponent],
  template: `
    <div class="tag-manager">
      <div class="tag-manager-header">
        <h3>Tags Management</h3>
      </div>

      <!-- Create New Tag Section -->
      <div class="create-tag-section">
        <div class="form-group">
          <label for="tagName">Tag Name:</label>
          <input 
            id="tagName"
            type="text" 
            [(ngModel)]="newTagName" 
            placeholder="Enter tag name"
            class="form-input"
            (keydown.enter)="createTag()"
          />
        </div>

        <div class="form-group">
          <label for="tagColor">Color:</label>
          <div class="color-picker-wrapper">
            <!-- Preset colors palette -->
            <div class="color-palette">
              <button 
                *ngFor="let color of presetColors"
                [style.background-color]="color"
                [class.selected]="newTagColor === color"
                (click)="selectPresetColor(color)"
                class="color-button"
                title="Quick color"
              ></button>
            </div>
            <!-- Manual color picker -->
            <input 
              id="tagColor"
              type="color" 
              [(ngModel)]="newTagColor" 
              class="color-picker"
              title="Custom color picker"
            />
            <span class="color-preview" [style.background-color]="newTagColor"></span>
          </div>
        </div>

        <button 
          (click)="createTag()" 
          [disabled]="!newTagName.trim() || isCreating"
          class="btn-primary"
        >
          {{ isCreating ? '⏳ Creating...' : '+ Create Tag' }}
        </button>
      </div>

      <!-- Error/Success Messages -->
      <div *ngIf="createError" class="error-message">❌ {{ createError }}</div>
      <div *ngIf="createSuccess" class="success-message">✅ {{ createSuccess }}</div>

      <!-- Tags List -->
      <div class="tags-list">
        <h4>Existing Tags ({{ tags.length }})</h4>
        <div class="tags-container">
          <div *ngFor="let tag of tags" class="tag-item">
            <app-tag-chip [tag]="tag" [removable]="true" (remove)="deleteTag($event)"></app-tag-chip>
          </div>
          <div *ngIf="tags.length === 0" class="empty-state">
            No tags created yet. Create one above!
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tag-manager {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
    }

    .tag-manager-header {
      margin-bottom: 20px;
      border-bottom: 2px solid #ddd;
      padding-bottom: 10px;
    }

    .tag-manager-header h3 {
      margin: 0;
      color: #333;
      font-size: 16px;
    }

    .create-tag-section {
      background: white;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 20px;
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      min-width: 150px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .form-input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .form-input:focus {
      outline: none;
      border-color: #4CAF50;
      box-shadow: 0 0 4px rgba(76, 175, 80, 0.2);
    }

    .color-picker-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .color-palette {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .color-button {
      width: 28px;
      height: 28px;
      border: 2px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
      padding: 0;
      background-size: 100% 100%;
    }

    .color-button:hover {
      transform: scale(1.1);
      border-color: #999;
    }

    .color-button.selected {
      border-color: #333;
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.4), inset 0 0 2px rgba(255, 255, 255, 0.5);
    }

    .color-picker {
      width: 50px;
      height: 36px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .color-preview {
      width: 30px;
      height: 30px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }

    .btn-primary {
      padding: 8px 20px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
      white-space: nowrap;
      font-size: 14px;
    }

    .btn-primary:hover:not(:disabled) {
      background-color: #45a049;
    }

    .btn-primary:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
      opacity: 0.6;
    }

    .error-message {
      color: #d32f2f;
      background-color: #ffebee;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .success-message {
      color: #388e3c;
      background-color: #e8f5e9;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .tags-list {
      background: white;
      border-radius: 6px;
      padding: 16px;
    }

    .tags-list h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #666;
      font-weight: 600;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 40px;
    }

    .tag-item {
      display: flex;
      align-items: center;
    }

    .empty-state {
      color: #999;
      font-size: 13px;
      padding: 20px;
      text-align: center;
    }
  `]
})
export class TagManagerComponent implements OnInit {
  @Input() sourcePath!: string;
  @Output() tagsUpdated = new EventEmitter<any[]>();

  tags: any[] = [];
  newTagName: string = '';
  newTagColor: string = '#808080';
  isCreating: boolean = false;
  isLoading: boolean = false;
  createError: string | null = null;
  createSuccess: string | null = null;

  // Preset colors for quick selection
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

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadTags();
  }

  /**
   * Load all tags from the source folder
   */
  loadTags(): void {
    if (!this.sourcePath) {
      return;
    }

    this.isLoading = true;
    this.http.get<any>('http://localhost:3001/api/tags/list', {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: (response) => {
        this.tags = response.tags || [];
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load tags:', err);
        this.isLoading = false;
        this.tags = [];
      }
    });
  }

  /**
   * Select a preset color for the new tag
   */
  selectPresetColor(color: string): void {
    this.newTagColor = color;
  }

  /**
   * Create a new tag
   */
  createTag(): void {
    if (!this.newTagName.trim()) {
      this.createError = 'Please enter a tag name';
      return;
    }

    this.isCreating = true;
    this.createError = null;
    this.createSuccess = null;

    this.http.post<any>('http://localhost:3001/api/tags/create', {
      sourcePath: this.sourcePath,
      name: this.newTagName.trim(),
      color: this.newTagColor
    }).subscribe({
      next: (response) => {
        this.tags.push(response.tag);
        this.newTagName = '';
        this.newTagColor = '#808080';
        this.isCreating = false;
        this.createSuccess = `Tag "${response.tag.name}" created successfully!`;
        this.tagsUpdated.emit(this.tags);

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.createSuccess = null;
        }, 3000);
      },
      error: (err) => {
        this.isCreating = false;
        this.createError = err.error?.error || 'Failed to create tag';
        console.error('Error creating tag:', err);
      }
    });
  }

  /**
   * Delete a tag
   */
  deleteTag(tagId: string): void {
    if (!confirm('Are you sure you want to delete this tag?')) {
      return;
    }

    this.http.delete<any>('http://localhost:3001/api/tags/delete/' + tagId, {
      params: { sourcePath: this.sourcePath }
    }).subscribe({
      next: () => {
        this.tags = this.tags.filter(t => t.id !== tagId);
        this.tagsUpdated.emit(this.tags);
      },
      error: (err) => {
        console.error('Failed to delete tag:', err);
      }
    });
  }
}
