import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ArtistGalleryService, ArtistGroupInfo, ImageMetadata } from '../../services/artist-gallery.service';
import { FolderPickerService } from '../../services/folder-picker.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';

@Component({
  selector: 'app-artist-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, ImageViewerModalComponent],
  templateUrl: './artist-gallery.component.html',
  styleUrls: ['./artist-gallery.component.scss']
})
export class ArtistGalleryComponent implements OnInit {
  sortedFolderPath: string = '';
  isLoading = false;
  error: string | null = null;
  groups: ArtistGroupInfo[] = [];
  totalImages = 0;
  
  // Image viewer modal - using shared component
  showImageViewer = false;
  currentGroupReviewData: ReviewImage | null = null;

  constructor(
    private galleryService: ArtistGalleryService,
    private folderPickerService: FolderPickerService
  ) {}

  ngOnInit(): void {}

  async selectSortedFolder(): Promise<void> {
    try {
      const folderName = await this.folderPickerService.pickFolder();

      if (!folderName) {
        this.error = 'No folder selected';
        return;
      }

      this.sortedFolderPath = folderName;
      this.error = null;
      this.loadGroups();
    } catch (err) {
      this.error = 'Error selecting folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  loadGroups(): void {
    if (!this.sortedFolderPath) {
      this.error = 'Please select a sorted folder';
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.groups = [];

    this.galleryService.loadArtistGroups(this.sortedFolderPath).subscribe({
      next: (response) => {
        if (response.success) {
          this.groups = response.groups;
          this.totalImages = response.totalImages;
          this.isLoading = false;
        } else {
          this.error = 'Failed to load artist groups';
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load groups from folder';
        this.isLoading = false;
        console.error('Error loading groups:', err);
      }
    });
  }

  openImageViewer(group: ArtistGroupInfo): void {
    this.currentGroupReviewData = {
      images: group.images,
      folder: group.folderPath,
      artists: group.artists,
      title: group.artists.join(' | '),
      apiType: 'artist-gallery'
    };
    this.showImageViewer = true;
  }

  closeImageViewer(): void {
    this.showImageViewer = false;
    this.currentGroupReviewData = null;
  }

  getThumbnailUrl(group: ArtistGroupInfo): string {
    return this.galleryService.getThumbnailUrl(
      group.folderPath,
      group.images[0]
    );
  }

  getArtistTagDisplay(group: ArtistGroupInfo): string {
    if (group.artists.length === 0) {
      return 'No Artists';
    }
    return group.artists.join(' | ');
  }
}
