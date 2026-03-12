import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ReviewService, ArtistGroupResult } from '../../services/review.service';
import { FolderPickerService } from '../../services/folder-picker.service';

@Component({
  selector: 'app-artist-grouping',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './artist-grouping.component.html',
  styleUrls: ['./artist-grouping.component.scss']
})
export class ArtistGroupingComponent implements OnInit {
  sourceFolder: string = '';
  sourceFolderName: string = '';
  destinationFolder: string = '';
  destinationFolderName: string = '';
  isLoading = false;
  error: string | null = null;
  result: ArtistGroupResult | null = null;
  
  // Progress tracking
  processingProgress = 0;
  processingMessage = '';

  constructor(
    private reviewService: ReviewService,
    private folderPickerService: FolderPickerService
  ) {}

  ngOnInit(): void {}

  async selectSourceFolder(): Promise<void> {
    try {
      const folderPath = await this.folderPickerService.pickFolder();

      if (!folderPath) {
        this.error = 'No source folder selected';
        return;
      }

      this.sourceFolder = folderPath;
      this.sourceFolderName = folderPath;
      this.error = null;
    } catch (err) {
      this.error = 'Error selecting source folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  async selectDestinationFolder(): Promise<void> {
    try {
      const folderPath = await this.folderPickerService.pickFolder();

      if (!folderPath) {
        this.error = 'No destination folder selected';
        return;
      }

      this.destinationFolder = folderPath;
      this.destinationFolderName = folderPath;
      this.error = null;
    } catch (err) {
      this.error = 'Error selecting destination folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Handle manual path input for source folder
   */
  onSourceFolderInputBlur(): void {
    const trimmedPath = this.sourceFolderName.trim();
    if (trimmedPath) {
      this.sourceFolder = trimmedPath;
      this.error = null;
    } else {
      this.sourceFolder = '';
    }
  }

  /**
   * Handle manual path input for destination folder
   */
  onDestinationFolderInputBlur(): void {
    const trimmedPath = this.destinationFolderName.trim();
    if (trimmedPath) {
      this.destinationFolder = trimmedPath;
      this.error = null;
    } else {
      this.destinationFolder = '';
    }
  }

  groupByArtists(): void {
    if (!this.sourceFolder) {
      this.error = 'Please select a source folder';
      return;
    }

    if (!this.destinationFolder) {
      this.error = 'Please select a destination folder';
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.result = null;
    this.processingProgress = 0;
    this.processingMessage = 'Initializing...';

    this.reviewService.groupImagesByArtistsWithPath(this.sourceFolder, this.destinationFolder).subscribe({
      next: (response) => {
        this.result = response;
        this.isLoading = false;
        this.processingProgress = 100;
        this.processingMessage = 'Complete!';
        
        // Reset progress after a delay
        setTimeout(() => {
          this.processingProgress = 0;
          this.processingMessage = '';
        }, 1500);
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to group images';
        this.isLoading = false;
        this.processingProgress = 0;
        this.processingMessage = '';
        console.error('Error grouping images:', err);
      }
    });
    
    // Simulate progress increments
    let progress = 0;
    const interval = setInterval(() => {
      if (!this.isLoading) {
        clearInterval(interval);
        return;
      }
      
      progress += Math.random() * 15;
      if (progress > 85) progress = 85; // Cap at 85% until complete
      
      this.processingProgress = Math.floor(progress);
      
      if (progress < 30) {
        this.processingMessage = 'Reading source folder...';
      } else if (progress < 60) {
        this.processingMessage = 'Processing images...';
      } else {
        this.processingMessage = 'Organizing files...';
      }
    }, 300);
  }

  getTotalArtistsCount(): number {
    if (!this.result?.imageMetadata) return 0;
    const artistSet = new Set<string>();
    this.result.imageMetadata.forEach(img => {
      img.artists.forEach(artist => artistSet.add(artist));
    });
    return artistSet.size;
  }
}
