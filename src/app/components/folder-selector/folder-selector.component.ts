import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FolderPickerService } from '../../services/folder-picker.service';

/**
 * Folder Selector Component
 * Allows users to select a source folder (artist gallery or prompt grouping)
 * Emits selected folder path to parent component
 */
@Component({
  selector: 'app-folder-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-selector.component.html',
  styleUrls: ['./folder-selector.component.scss']
})
export class FolderSelectorComponent implements OnInit {
  @Output() folderSelected = new EventEmitter<string>();
  
  folderPath: string = '';
  error: string | null = null;
  isLoading: boolean = false;

  constructor(private folderPickerService: FolderPickerService) {}

  ngOnInit(): void {
    // Initialize with any previously selected folder from localStorage
    const savedFolder = localStorage.getItem('selectedSourceFolder');
    if (savedFolder) {
      this.folderPath = savedFolder;
    }
  }

  /**
   * Open native folder picker to select folder
   */
  async selectFolder(): Promise<void> {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      this.error = null;

      const selectedPath = await this.folderPickerService.pickFolder();

      if (!selectedPath) {
        this.error = 'No folder selected';
        this.isLoading = false;
        return;
      }

      this.folderPath = selectedPath;
      this.saveAndEmit();
    } catch (err) {
      this.error = 'Error selecting folder: ' + (err instanceof Error ? err.message : String(err));
      this.isLoading = false;
    }
  }

  /**
   * Handle manual path input
   */
  onPathBlur(): void {
    const trimmedPath = this.folderPath.trim();
    if (trimmedPath) {
      this.folderPath = trimmedPath;
      this.error = null;
    }
  }

  /**
   * Save folder to localStorage and emit to parent
   */
  saveAndEmit(): void {
    if (!this.folderPath.trim()) {
      this.error = 'Please select or enter a folder path';
      return;
    }

    localStorage.setItem('selectedSourceFolder', this.folderPath);
    this.error = null;
    this.isLoading = false;
    this.folderSelected.emit(this.folderPath);
  }

  /**
   * Clear the selected folder
   */
  clearFolder(): void {
    this.folderPath = '';
    this.error = null;
    localStorage.removeItem('selectedSourceFolder');
  }

  /**
   * Handle key press in path input
   */
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveAndEmit();
    }
  }
}
