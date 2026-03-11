import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService, ArtistGroupResult } from '../../services/review.service';

@Component({
  selector: 'app-artist-grouping',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  constructor(private reviewService: ReviewService) {}

  ngOnInit(): void {}

  selectSourceFolder(): void {
    const folderPath = prompt(
      'Enter the full path to the source folder containing PNG images:\n\nExample: /Users/name/Pictures/images'
    );

    if (folderPath === null) {
      return; // User cancelled
    }

    const trimmedPath = folderPath.trim();

    if (!trimmedPath) {
      this.error = 'Please enter a valid folder path';
      return;
    }

    this.sourceFolder = trimmedPath;
    this.sourceFolderName = trimmedPath;
    this.error = null;
  }

  selectDestinationFolder(): void {
    const folderPath = prompt(
      'Enter the full path to the destination folder where sorted subfolders will be created:\n\nExample: /Users/name/Pictures/sorted'
    );

    if (folderPath === null) {
      return; // User cancelled
    }

    const trimmedPath = folderPath.trim();

    if (!trimmedPath) {
      this.error = 'Please enter a valid folder path';
      return;
    }

    this.destinationFolder = trimmedPath;
    this.destinationFolderName = trimmedPath;
    this.error = null;
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
        this.processingMessage = 'Extracting artist tags...';
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
