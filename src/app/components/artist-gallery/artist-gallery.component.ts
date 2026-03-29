import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ArtistGalleryService, ArtistGroupInfo, ImageMetadata } from '../../services/artist-gallery.service';
import { GalleryCacheService } from '../../services/gallery-cache.service';
import { FolderPickerService } from '../../services/folder-picker.service';
import { RatingsStateService } from '../../services/ratings-state.service';
import { CurrentSourceFolderService } from '../../services/current-source-folder.service';
import { ReviewRequestService } from '../../services/review-request.service';
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

  // Rating filter and sort state
  minAverageRating: number = 0;
  ratingFilterOptions = [
    { label: 'All', value: 0 },
    { label: 'Rated Only', value: 0.1 },
    { label: '≥ 2', value: 2 },
    { label: '≥ 3', value: 3 },
    { label: '≥ 4', value: 4 },
    { label: '≥ 5', value: 5 },
    { label: '≥ 6', value: 6 },
    { label: '≥ 7', value: 7 },
    { label: '≥ 8', value: 8 },
    { label: '≥ 9', value: 9 }
  ];
  sortByRating: 'desc' | 'asc' | 'none' = 'none';
  sortByModified: 'desc' | 'asc' | 'none' = 'none';

  // For unsubscribing from observables on component destroy
  private destroy$ = new Subject<void>();

  constructor(
    private galleryService: ArtistGalleryService,
    private folderPickerService: FolderPickerService,
    private cacheService: GalleryCacheService,
    private ratingsStateService: RatingsStateService,
    private currentSourceFolderService: CurrentSourceFolderService,
    private reviewRequestService: ReviewRequestService
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

    // Listen for ratings updates from other components (e.g., prompt-grouping)
    this.ratingsStateService.ratingsUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ folder, ratings }) => {
        console.log('[ArtistGallery] Detected ratings update from other component:', folder);
        // Only refresh if the folder matches our current folder
        if (folder === this.sortedFolderPath || folder === this.baseFolder) {
          console.log('[ArtistGallery] Ratings match our folder, refreshing display...');
          this.refreshAverageRatings();
        }
      });

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
      // Update the global source folder for other components
      this.currentSourceFolderService.setSourceFolder(folderPath);
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
          // This will update filteredGroups once ratings are loaded
          this.refreshAverageRatings();
          
          this.isLoading = false;
          
          // Note: Don't set filteredGroups here - wait for refreshAverageRatings() to complete
          // and set it after average ratings are calculated
          
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
            imageRatings: groupRatings,
            additionalData: {
              baseFolder: this.baseFolder
            }
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
          imageRatings: {},
          additionalData: {
            baseFolder: this.baseFolder
          }
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
    // IMPORTANT: MERGE new ratings with existing ones to prevent data loss
    if (ratingsToUse !== undefined && ratingsToUse !== null) {
      console.log('[ArtistGallery] Ratings from modal:', ratingsToUse);
      
      const ratingsFolder = this.baseFolder || this.sortedFolderPath;
      const ratingsToSave = ratingsToUse as { [filename: string]: number };

      console.log('[ArtistGallery] Loading existing ratings from:', ratingsFolder);
      
      // MERGE: Load all existing ratings first, then merge with modal ratings
      this.galleryService.loadRatings(ratingsFolder).subscribe({
        next: (loadResponse) => {
          const allExistingRatings = (loadResponse.success && loadResponse.ratings) ? loadResponse.ratings : {};
          console.log('[ArtistGallery] All existing ratings:', allExistingRatings);
          
          // Merge: keep all existing ratings, update with new ones from modal
          const mergedRatings = { ...allExistingRatings, ...ratingsToSave };
          console.log('[ArtistGallery] Merged ratings:', mergedRatings);
          
          // Now save the MERGED ratings
          this.galleryService.saveRatings(ratingsFolder, mergedRatings).subscribe({
            next: (response) => {
              console.log('[ArtistGallery] Ratings saved successfully:', response);
              // Notify other components about the ratings update
              this.ratingsStateService.notifyRatingsSaved(ratingsFolder, mergedRatings);
              // Refresh average ratings for display
              this.refreshAverageRatings();
            },
            error: (err) => {
              console.error('[ArtistGallery] Failed to save ratings:', err);
              // Still refresh to update the UI
              this.refreshAverageRatings();
            }
          });
        },
        error: (err) => {
          console.warn('[ArtistGallery] Failed to load existing ratings, saving modal ratings only:', err);
          // If we can't load existing, just save what we have from modal
          this.galleryService.saveRatings(ratingsFolder, ratingsToSave).subscribe({
            next: (response) => {
              console.log('[ArtistGallery] Ratings saved successfully:', response);
              this.ratingsStateService.notifyRatingsSaved(ratingsFolder, ratingsToSave);
              this.refreshAverageRatings();
            },
            error: (err2) => {
              console.error('[ArtistGallery] Failed to save ratings:', err2);
              this.refreshAverageRatings();
            }
          });
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
    
    let baseGroups = [...this.groups];

    // Apply rating filter
    if (this.minAverageRating > 0) {
      baseGroups = baseGroups.filter(group => 
        group.averageRating !== undefined && group.averageRating >= this.minAverageRating
      );
    }

    if (!searchQuery) {
      this.filteredGroups = baseGroups;
      this.applySorting();
      
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

    this.filteredGroups = baseGroups.filter(group => {
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

    // Apply sorting
    this.applySorting();

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
    // Complete the destroy subject to unsubscribe from all observables
    this.destroy$.next();
    this.destroy$.complete();
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
          
          // CRITICAL FIX: Match full filenames directly from ratings file
          // This preserves all ratings even when multiple images share the same seed
          // (e.g., "s-2509735441.png", "s-2509735441 (1).png", "s-2509735441 (2).png" are different ratings!)
          
          this.groups.forEach(group => {
            const oldRating = group.averageRating;
            
            // Calculate average based on images in this group
            if (group.images && group.images.length > 0) {
              // Convert array of filenames to object of {filename: rating}
              const groupRatingsObj: { [filename: string]: number } = {};
              group.images.forEach((filename: string) => {
                // Look for exact match first, then try fuzzy matching
                // The ratings file may have full prompts as keys, so we need to match smartly
                
                // Check for exact match
                if (allImageRatings[filename]) {
                  groupRatingsObj[filename] = allImageRatings[filename];
                } else {
                  // Try to find a match by checking if any rating key ends with this filename
                  const ratingKey = Object.keys(allImageRatings).find(key => {
                    // The rating key could be a full prompt ending with the filename
                    // e.g., "1girl, ... s-2509735441 (1).png" contains "s-2509735441 (1).png"
                    return key.endsWith(filename) || key.includes(filename);
                  });
                  
                  if (ratingKey && allImageRatings[ratingKey]) {
                    groupRatingsObj[filename] = allImageRatings[ratingKey];
                  }
                }
              });
              
              group.averageRating = this.calculateAverageRating(groupRatingsObj);
              const ratedCount = Object.keys(groupRatingsObj).length;
              console.log(`[ArtistGallery] Group ${group.artists.join('|')}: images=${group.images.length}, rated=${ratedCount}, average=${group.averageRating} (was ${oldRating})`);
            }
          });

          // Re-apply search to update display
          if (this.searchText && this.searchText.trim()) {
            this.applySearch();
          } else {
            this.filteredGroups = [...this.groups];
            // Apply all active sorting (rating and modified date)
            this.applySorting();
          }
        }
      },
      error: (err) => {
        console.error('[ArtistGallery] Failed to load ratings:', err);
      }
    });
  }

  /**
   * Handle minimum average rating filter change
   */
  onMinAverageRatingChange(): void {
    this.applySearch();
  }

  /**
   * Toggle rating sort between none, descending, and ascending
   */
  toggleRatingSorting(): void {
    if (this.sortByRating === 'none') {
      this.sortByRating = 'desc';
    } else if (this.sortByRating === 'desc') {
      this.sortByRating = 'asc';
    } else {
      this.sortByRating = 'none';
    }
    this.applySearch();
  }

  /**
   * Get the label for the rating sort button with indicator
   */
  getRatingSortLabel(): string {
    if (this.sortByRating === 'desc') {
      return '↓ Rating (High → Low)';
    } else if (this.sortByRating === 'asc') {
      return '↑ Rating (Low → High)';
    }
    return '⇄ Rating (No Sort)';
  }

  /**
   * Toggle latest modified sort between none, descending (newest first), and ascending (oldest first)
   */
  toggleModifiedSorting(): void {
    if (this.sortByModified === 'none') {
      this.sortByModified = 'desc'; // Newest first
    } else if (this.sortByModified === 'desc') {
      this.sortByModified = 'asc'; // Oldest first
    } else {
      this.sortByModified = 'none';
    }
    this.applySearch();
  }

  /**
   * Get the label for the modified sort button with indicator
   */
  getModifiedSortLabel(): string {
    if (this.sortByModified === 'desc') {
      return '↓ Modified (Newest First)';
    } else if (this.sortByModified === 'asc') {
      return '↑ Modified (Oldest First)';
    }
    return '⇄ Modified (No Sort)';
  }

  /**
   * Apply all active sorting: modified date takes precedence over rating
   */
  private applySorting(): void {
    if (this.sortByModified === 'desc') {
      this.filteredGroups.sort((a, b) => {
        const aTime = a.latestModifiedTime ? new Date(a.latestModifiedTime).getTime() : 0;
        const bTime = b.latestModifiedTime ? new Date(b.latestModifiedTime).getTime() : 0;
        return bTime - aTime; // Descending: newest first
      });
    } else if (this.sortByModified === 'asc') {
      this.filteredGroups.sort((a, b) => {
        const aTime = a.latestModifiedTime ? new Date(a.latestModifiedTime).getTime() : 0;
        const bTime = b.latestModifiedTime ? new Date(b.latestModifiedTime).getTime() : 0;
        return aTime - bTime; // Ascending: oldest first
      });
    } else if (this.sortByRating === 'desc') {
      this.filteredGroups.sort((a, b) => {
        const aRating = a.averageRating ?? 0;
        const bRating = b.averageRating ?? 0;
        return bRating - aRating; // Descending: highest first
      });
    } else if (this.sortByRating === 'asc') {
      this.filteredGroups.sort((a, b) => {
        const aRating = a.averageRating ?? 0;
        const bRating = b.averageRating ?? 0;
        return aRating - bRating; // Ascending: lowest first
      });
    }
  }

  /**
   * Request to create/edit review for this group
   */
  requestReview(group: ArtistGroupInfo): void {
    const artistNames = group.artists.join(', ');
    this.reviewRequestService.requestReview({
      sourceFolder: this.sortedFolderPath,
      source: 'artist_gallery',
      foreignId: group.folderPath,
      title: artistNames
    });
  }
}

