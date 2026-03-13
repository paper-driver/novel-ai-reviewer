import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ArtistGalleryService, ArtistGroupInfo, ImageMetadata } from '../../services/artist-gallery.service';
import { GalleryCacheService } from '../../services/gallery-cache.service';
import { FolderPickerService } from '../../services/folder-picker.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';

@Component({
  selector: 'app-artist-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, ImageViewerModalComponent],
  templateUrl: './artist-gallery.component.html',
  styleUrls: ['./artist-gallery.component.scss']
})
export class ArtistGalleryComponent implements OnInit, OnDestroy {
  sortedFolderPath: string = '';
  baseFolder: string = '';  // For storing/loading ratings from the base generated folder
  isLoading = false;
  error: string | null = null;
  groups: ArtistGroupInfo[] = [];
  filteredGroups: ArtistGroupInfo[] = [];
  totalImages = 0;
  
  // Image viewer modal - using shared component
  showImageViewer = false;
  currentGroupReviewData: ReviewImage | null = null;

  // Timezone info for user reference
  userTimezone: string = '';

  // Back to top button
  showBackToTopButton = false;

  // Search functionality
  searchText: string = '';

  constructor(
    private galleryService: ArtistGalleryService,
    private folderPickerService: FolderPickerService,
    private cacheService: GalleryCacheService
  ) {
    // Get user's timezone for display
    const timeZoneOffset = new Date().getTimezoneOffset();
    const hours = Math.abs(Math.floor(timeZoneOffset / 60));
    const minutes = Math.abs(timeZoneOffset % 60);
    const sign = timeZoneOffset > 0 ? '-' : '+';
    this.userTimezone = `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  ngOnInit(): void {
    // Check if we have cached data from previous visit
    const cachedData = this.cacheService.getArtistGalleryData();
    if (cachedData && cachedData.groups.length > 0) {
      // Restore cached data
      this.sortedFolderPath = cachedData.folderPath;
      this.groups = cachedData.groups;
      this.filteredGroups = cachedData.filteredGroups;
      this.searchText = cachedData.searchText;
      this.totalImages = cachedData.totalImages;
      
      // Load and calculate average ratings from localStorage
      this.refreshAverageRatings();
      
      this.isLoading = false;
    }

    // Listen for scroll events to show/hide back-to-top button
    window.addEventListener('scroll', () => {
      this.showBackToTopButton = window.scrollY > 300;
    });
  }

  /**
   * Scroll back to top of the page smoothly
   */
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  async selectSortedFolder(): Promise<void> {
    try {
      const folderPath = await this.folderPickerService.pickFolder();

      if (!folderPath) {
        this.error = 'No folder selected';
        return;
      }

      this.sortedFolderPath = folderPath;
      this.error = null;
      this.loadGroups();
    } catch (err) {
      this.error = 'Error selecting folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Handle manual path input for sorted folder
   */
  onSortedFolderInputBlur(): void {
    const trimmedPath = this.sortedFolderPath.trim();
    if (trimmedPath) {
      this.sortedFolderPath = trimmedPath;
      this.error = null;
    } else {
      this.sortedFolderPath = '';
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
    this.filteredGroups = [];
    // Don't clear searchText here - preserve it across page switches
    // User must manually clear search by clicking the clear button

    this.galleryService.loadArtistGroups(this.sortedFolderPath).subscribe({
      next: (response) => {
        if (response.success) {
          this.groups = response.groups;
          this.totalImages = response.totalImages;
          this.baseFolder = response.baseFolder || this.sortedFolderPath; // Store base folder for ratings
          
          console.log('[ArtistGallery] Loaded groups, base folder for ratings:', this.baseFolder);
          
          // Load and calculate average ratings from base folder
          this.refreshAverageRatings();
          
          this.isLoading = false;
          
          // Re-apply search filter if there's an active search
          if (this.searchText.trim()) {
            this.applySearch();
          } else {
            this.filteredGroups = response.groups;
          }
          
          // Save to cache after successful load
          this.cacheService.setArtistGalleryData(
            this.sortedFolderPath,
            this.groups,
            this.filteredGroups,
            this.searchText,
            this.totalImages
          );
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
    // Load ratings from server if they exist
    const ratingsFolder = this.baseFolder || this.sortedFolderPath;
    console.log('[ArtistGallery] openImageViewer called');
    console.log('[ArtistGallery] sortedFolderPath:', this.sortedFolderPath);
    console.log('[ArtistGallery] baseFolder:', this.baseFolder);
    console.log('[ArtistGallery] ratingsFolder being used:', ratingsFolder);
    console.log('[ArtistGallery] group.images:', group.images);
    
    this.galleryService.loadRatings(ratingsFolder).subscribe({
      next: (response) => {
        console.log('[ArtistGallery] loadRatings response:', response);
        if (response.success) {
          // Ratings are now stored flat by filename: { filename: rating }
          const allRatings = response.ratings as { [filename: string]: number };
          console.log('[ArtistGallery] All ratings loaded:', allRatings);
          
          // Filter to only ratings for images in this group
          const groupRatings: { [filename: string]: number } = {};
          if (group.images && allRatings) {
            group.images.forEach(filename => {
              console.log('[ArtistGallery] Checking filename:', filename, 'has rating:', allRatings[filename]);
              if (allRatings[filename]) {
                groupRatings[filename] = allRatings[filename];
              }
            });
          }

          this.currentGroupReviewData = {
            images: group.images,
            folder: group.folderPath,
            artists: group.artists,
            title: group.artists.join(' | '),
            apiType: 'artist-gallery',
            imageRatings: groupRatings
          };
          console.log('[ArtistGallery] Review data set with ratings:', groupRatings);
          this.showImageViewer = true;
        }
      },
      error: (err) => {
        console.error('[ArtistGallery] Failed to load ratings:', err);
        // Still open the viewer, just without ratings
        this.currentGroupReviewData = {
          images: group.images,
          folder: group.folderPath,
          artists: group.artists,
          title: group.artists.join(' | '),
          apiType: 'artist-gallery',
          imageRatings: {}
        };
        this.showImageViewer = true;
      }
    });
  }

  // Store latest ratings received from modal
  private latestModalRatings: { [filename: string]: number } | null = null;

  /**
   * Handle ratings changed from modal
   */
  onRatingsChanged(ratings: { [filename: string]: number }): void {
    // Store ratings in current group review data AND in a separate property
    console.log('[ArtistGallery] Ratings changed:', ratings);
    this.latestModalRatings = ratings;
    if (this.currentGroupReviewData) {
      this.currentGroupReviewData.imageRatings = ratings;
      console.log('[ArtistGallery] Stored ratings in review data:', this.currentGroupReviewData.imageRatings);
    }
  }

  closeImageViewer(): void {
    console.log('[ArtistGallery] Closing image viewer');
    console.log('[ArtistGallery] Current review data:', this.currentGroupReviewData);
    console.log('[ArtistGallery] Latest modal ratings:', this.latestModalRatings);
    
    // Use ratings from either currentGroupReviewData or latestModalRatings
    const ratingsToUse = this.latestModalRatings || (this.currentGroupReviewData?.imageRatings);
    
    // Save ratings to base folder (where prompt grouping also saves)
    if (ratingsToUse && Object.keys(ratingsToUse).length > 0) {
      console.log('[ArtistGallery] Ratings to save:', ratingsToUse);
      
      // Send ratings as-is (flat structure: { filename: rating })
      const ratingsToSave = ratingsToUse as { [filename: string]: number };
      const ratingsFolder = this.baseFolder || this.sortedFolderPath;

      console.log('[ArtistGallery] Calling saveRatings with folder:', ratingsFolder);
      this.galleryService.saveRatings(ratingsFolder, ratingsToSave).subscribe({
        next: (response) => {
          console.log('[ArtistGallery] Ratings saved successfully:', response);
          // Refresh average ratings for display
          this.refreshAverageRatings();
        },
        error: (err) => {
          console.error('[ArtistGallery] Failed to save ratings:', err);
          // Still refresh to update the UI
          this.refreshAverageRatings();
        }
      });
    } else {
      console.log('[ArtistGallery] No ratings to save');
      this.refreshAverageRatings();
    }

    this.showImageViewer = false;
    this.currentGroupReviewData = null;
    this.latestModalRatings = null;
  }

  /**
   * Apply search filter to artist groups.
   * Searches for artist tag combinations with intelligent parsing.
   * Supports multiple search formats and handles whitespace variations.
   */
  applySearch(): void {
    let searchQuery = this.searchText.trim();
    
    if (!searchQuery) {
      this.filteredGroups = [...this.groups];
      // Save to cache
      this.cacheService.setArtistGalleryData(
        this.sortedFolderPath,
        this.groups,
        this.filteredGroups,
        this.searchText,
        this.totalImages
      );
      return;
    }

    // Comprehensive normalization of search query
    // Step 1: Remove "artist:" keywords
    searchQuery = searchQuery.replace(/artist:\s*/gi, '').trim();
    
    // Step 2: Normalize all separators to spaces then to dashes
    // This handles: commas, pipes, and any mixture
    searchQuery = searchQuery.replace(/[,|]/g, ' - ').trim();
    
    // Step 3: Remove spaces around brackets to handle "[[[item ]]]" vs "[[[item]]]"
    // This is key for matching variations with extra whitespace
    searchQuery = searchQuery.replace(/\s+([}\]\)])/g, '$1').replace(/([{\[\(])\s+/g, '$1');
    
    // Create lowercase version for searching
    const searchLower = searchQuery.toLowerCase();
    
    // Also normalize with spaces inside brackets removed
    const searchNormalized = searchLower.replace(/\s+([}\]\)])/g, '$1').replace(/([{\[\(])\s+/g, '$1');

    this.filteredGroups = this.groups.filter(group => {
      // Get the full artist tag combination as displayed
      const artistDisplay = this.getArtistTagDisplay(group);
      const displayLower = artistDisplay.toLowerCase();
      
      // Normalize display: remove spaces around brackets
      const displayNormalized = displayLower.replace(/\s+([}\]\)])/g, '$1').replace(/([{\[\(])\s+/g, '$1');
      
      // Strategy 1: Try exact substring match on normalized versions
      if (displayNormalized.includes(searchNormalized)) {
        return true;
      }
      
      // Strategy 2: Try with original lowercased versions
      if (displayLower.includes(searchLower)) {
        return true;
      }
      
      // Strategy 3: Term-based matching (split by separators and match individual artists)
      const searchTerms = searchNormalized
        .split(/\s*[-|,]\s*/)
        .map(term => term.toLowerCase().trim())
        .filter(term => term.length > 0);
      
      const displayTerms = displayNormalized
        .split(/\s*[-|,]\s*/)
        .map(term => term.toLowerCase().trim());
      
      // All search terms must be found in display terms (AND logic)
      if (searchTerms.length > 0) {
        return searchTerms.every(searchTerm => 
          displayTerms.some(displayTerm => 
            displayTerm.includes(searchTerm)
          )
        );
      }
      
      return false;
    });

    // Save to cache
    this.cacheService.setArtistGalleryData(
      this.sortedFolderPath,
      this.groups,
      this.filteredGroups,
      this.searchText,
      this.totalImages
    );
  }

  /**
   * Clear search and show all groups
   */
  clearSearch(): void {
    this.searchText = '';
    this.filteredGroups = [...this.groups];
    
    // Save to cache
    this.cacheService.setArtistGalleryData(
      this.sortedFolderPath,
      this.groups,
      this.filteredGroups,
      this.searchText,
      this.totalImages
    );
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

  /**
   * Format latest modification date for display
   * Uses local timezone for accurate date comparisons
   */
  formatLatestModifiedDate(group: ArtistGroupInfo): string {
    if (!group.latestModifiedTime) {
      return 'Unknown';
    }
    
    // Create dates in local timezone
    const modDate = new Date(group.latestModifiedTime);
    const now = new Date();
    
    // Get local date parts (ignoring time for day comparison)
    const modLocalDate = new Date(modDate.getFullYear(), modDate.getMonth(), modDate.getDate());
    const nowLocalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffMs = nowLocalDate.getTime() - modLocalDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Format time portion
    const timeString = modDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
    
    // Show relative time for recent dates, absolute date for older ones
    if (diffDays === 0) {
      return 'Today ' + timeString;
    } else if (diffDays === 1) {
      return 'Yesterday ' + timeString;
    } else if (diffDays < 30) {
      return `${diffDays}d ago`;
    } else {
      return modDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    }
  }

  /**
   * Open the sorted folder in the system file explorer
   */
  async openFolderInFinder(): Promise<void> {
    if (!this.sortedFolderPath) {
      this.error = 'Please select a folder first';
      return;
    }

    try {
      const response = await this.galleryService.openFolderInFinder(this.sortedFolderPath);
      if (!response.success) {
        this.error = 'Failed to open folder: ' + (response.error || 'Unknown error');
      }
    } catch (err) {
      this.error = 'Error opening folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Save current state to cache before component is destroyed
   * This ensures data is preserved when user switches to another tab
   */
  ngOnDestroy(): void {
    // Save current state to cache
    this.cacheService.setArtistGalleryData(
      this.sortedFolderPath,
      this.groups,
      this.filteredGroups,
      this.searchText,
      this.totalImages
    );
  }

  /**
   * Calculate average rating for a group based on image ratings
   * Ignores images with no rating (0 or undefined)
   */
  calculateAverageRating(imageRatings: { [filename: string]: number } | undefined): number | undefined {
    if (!imageRatings || Object.keys(imageRatings).length === 0) {
      return undefined;
    }

    const ratedValues = Object.values(imageRatings).filter(rating => rating && rating > 0);
    if (ratedValues.length === 0) {
      return undefined;
    }

    const sum = ratedValues.reduce((acc, rating) => acc + rating, 0);
    return sum / ratedValues.length;
  }

  /**
   * Refresh average ratings for all groups based on stored ratings from server
   */
  refreshAverageRatings(): void {
    console.log('[ArtistGallery] Refreshing average ratings from base folder:', this.baseFolder);
    // Use baseFolder if available, otherwise fall back to sortedFolderPath
    const ratingsFolder = this.baseFolder || this.sortedFolderPath;
    
    this.galleryService.loadRatings(ratingsFolder).subscribe({
      next: (response) => {
        console.log('[ArtistGallery] Loaded ratings from server:', response);
        if (response.success && response.ratings) {
          // Get all image ratings from flat structure (filename: rating)
          const allImageRatings = response.ratings as { [filename: string]: number };
          console.log('[ArtistGallery] All image ratings:', allImageRatings);
          
          this.groups.forEach(group => {
            const oldRating = group.averageRating;
            
            // Calculate average based on images in this group
            if (group.images && group.images.length > 0) {
              // Convert array of filenames to object of {filename: rating}
              const groupRatingsObj: { [filename: string]: number } = {};
              group.images.forEach((filename: string) => {
                if (allImageRatings[filename]) {
                  groupRatingsObj[filename] = allImageRatings[filename];
                }
              });
              
              group.averageRating = this.calculateAverageRating(groupRatingsObj);
              const ratedCount = Object.keys(groupRatingsObj).length;
              console.log(`[ArtistGallery] Group ${group.artists.join('|')}: images=${group.images.length}, rated=${ratedCount}, average=${group.averageRating} (was ${oldRating})`);
            }
          });

          // Re-apply search to update display
          if (this.searchText) {
            this.applySearch();
          } else {
            this.filteredGroups = [...this.groups];
          }
        }
      },
      error: (err) => {
        console.error('[ArtistGallery] Failed to load ratings:', err);
      }
    });
  }
}
