import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Tag Chip Component
 * Reusable component to display a single tag with optional delete action
 * Can be used in reviews, galleries, prompts, or any entity that supports tags
 */
@Component({
  selector: 'app-tag-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tag-chip" [style.background-color]="tag.color" [style.color]="getTextColor(tag.color)">
      <span class="tag-name">{{ tag.name }}</span>
      <button 
        *ngIf="removable" 
        class="tag-remove-btn" 
        (click)="onRemove()" 
        [title]="'Remove ' + tag.name"
        type="button"
      >
        ×
      </button>
    </div>
  `,
  styles: [`
    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      user-select: none;
      transition: opacity 0.2s;
    }

    .tag-chip:hover {
      opacity: 0.85;
    }

    .tag-name {
      margin: 0;
    }

    .tag-remove-btn {
      background: none;
      border: none;
      color: inherit;
      font-size: 16px;
      padding: 0;
      margin: 0;
      cursor: pointer;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      transition: background-color 0.2s;
    }

    .tag-remove-btn:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }
  `]
})
export class TagChipComponent {
  @Input() tag!: { id: string; name: string; color: string };
  @Input() removable: boolean = false;
  @Output() remove = new EventEmitter<string>();

  /**
   * Determine if text should be light or dark based on background color
   */
  getTextColor(bgColor: string): string {
    // Convert hex to RGB
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return light text for dark backgrounds, dark text for light backgrounds
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }

  onRemove(): void {
    this.remove.emit(this.tag.id);
  }
}
