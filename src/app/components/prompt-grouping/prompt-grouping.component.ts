import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { PromptGroupingService, PromptGroupInfo } from '../../services/prompt-grouping.service';
import { GalleryCacheService } from '../../services/gallery-cache.service';
import { FolderPickerService } from '../../services/folder-picker.service';
import { RatingsStateService } from '../../services/ratings-state.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';
import { Subject, interval, forkJoin, from, of } from 'rxjs';
import { takeUntil, switchMap, mergeMap, map, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-prompt-grouping',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, ImageViewerModalComponent],
  templateUrl: './prompt-grouping.component.html',
  styleUrls: ['./prompt-grouping.component.scss']
})
export class PromptGroupingComponent implements OnInit, OnDestroy {
  folderPath: string = '';
  isLoading = false;
  error: string | null = null;
  groups: PromptGroupInfo[] = [];
  filteredGroups: PromptGroupInfo[] = [];
  totalImages = 0;
  
  // Image viewer modal - using shared component
  showImageViewer = false;
  currentGroupReviewData: ReviewImage | null = null;

  // Timezone info for user reference
  userTimezone: string = '';

  // Nickname editing state
  editingGroupId: number | null = null;
  editingNickname: string = '';
  savingNickname = false;
  showNicknameAssignDropdown = false;
  filteredEditingNicknames: string[] = []; // Filtered suggestions while editing
  selectedSuggestionIndex: number = -1; // Track selected suggestion via keyboard

  // Filter state
  filterText: string = '';
  showFilters = false;
  showOnlyNoNickname = false;

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

  // Bulk nickname assignment state
  showBulkAssignDropdown = false;
  bulkAssignNickname: string = '';
  filteredBulkAssignNicknames: string[] = [];
  selectedBulkIndex: number = -1;
  isAssigningBulkNickname = false;
  bulkAssignProgress = 0;
  bulkAssignProgressText = '';

  // Nickname dropdown
  availableNicknames: string[] = [];
  showNicknameDropdown = false;

  // Back to top button
  showBackToTopButton = false;

  // Progress tracking
  showProgress = false;
  progressPercentage = 0;
  progressText = '';
  private destroy$ = new Subject<void>();
  private progressSubscription: any;

  constructor(
    private groupingService: PromptGroupingService,
    private folderPickerService: FolderPickerService,
    private cacheService: GalleryCacheService,
    private ratingsStateService: RatingsStateService
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
    const cachedData = this.cacheService.getPromptGroupingData();
    if (cachedData && cachedData.groups.length > 0) {
      // Restore cached data
      this.folderPath = cachedData.generatedFolder;
      this.groups = cachedData.groups;
      this.filteredGroups = cachedData.filteredGroups;
      this.filterText = cachedData.searchText;
      // Restore nickname assignments from cache
      // selectedNicknames is { groupId: nickname }, so we need values not keys
      this.availableNicknames = Array.from(new Set(Object.values(cachedData.selectedNicknames).filter(n => n && n.trim()))).sort();
      
      // Load and calculate average ratings from localStorage
      this.refreshAverageRatings();
      
      // Apply any filter that was active
      if (this.filterText) {
        this.applyFilter();
      }
      this.isLoading = false;
    }

    // Listen for ratings updates from other components (e.g., artist-gallery)
    this.ratingsStateService.ratingsUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ folder, ratings }) => {
        console.log('[PromptGrouping] Detected ratings update from other component:', folder);
        // Only refresh if the folder matches our current folder
        if (folder === this.folderPath) {
          console.log('[PromptGrouping] Ratings match our folder, refreshing display...');
          this.refreshAverageRatings();
        }
      });

    // Listen for scroll events to show/hide back-to-top button
    window.addEventListener('scroll', () => {
      this.showBackToTopButton = window.scrollY > 300;
    });
  }

  ngOnDestroy(): void {
    // Save current state to cache before component is destroyed
    const selectedNicknames: { [key: string]: string } = {};
    this.groups.forEach(group => {
      if (group.groupNickname && group.groupNickname.trim()) {
        selectedNicknames[group.groupId] = group.groupNickname;
      }
    });
    this.cacheService.setPromptGroupingData(
      this.folderPath,
      this.groups,
      this.filteredGroups,
      this.filterText,
      selectedNicknames
    );

    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }
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

  async selectFolder(): Promise<void> {
    try {
      const selectedPath = await this.folderPickerService.pickFolder();

      if (!selectedPath) {
        this.error = 'No folder selected';
        return;
      }

      this.folderPath = selectedPath;
      this.error = null;
      this.loadGroups();
    } catch (err) {
      this.error = 'Error selecting folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Handle manual path input
   */
  onFolderInputBlur(): void {
    const trimmedPath = this.folderPath.trim();
    if (trimmedPath) {
      this.folderPath = trimmedPath;
      this.error = null;
    } else {
      this.folderPath = '';
    }
  }

  loadGroups(): void {
    if (!this.folderPath) {
      this.error = 'Please select a folder';
      return;
    }

    this.isLoading = true;
    this.showProgress = true;
    this.progressPercentage = 5;
    this.progressText = 'Loading prompt groups...';
    this.error = null;
    this.groups = [];

    // Start polling for progress updates
    this.progressSubscription = interval(500)
      .pipe(
        switchMap(() => this.groupingService.getLoadingProgress(this.folderPath)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (progress) => {
          this.progressPercentage = progress.percentage;
          this.progressText = `Processing: ${progress.processedFiles}/${progress.totalFiles} files`;
          
          if (progress.status === 'idle' || progress.percentage === 100) {
            // Stop polling when complete
            if (this.progressSubscription) {
              this.progressSubscription.unsubscribe();
            }
          }
        },
        error: (err) => {
          console.warn('Error getting progress:', err);
        }
      });

    // Load the groups
    this.groupingService.loadPromptGroups(this.folderPath, true).subscribe({
      next: (response) => {
        if (response.success) {
          this.groups = response.groups;
          this.totalImages = response.totals.images;
          this.extractAvailableNicknames();
          
          this.isLoading = false;
          this.showProgress = false;
          
          if (response.cached) {
            this.progressText = `Loaded ${this.groups.length} groups (from cache)`;
          } else {
            this.progressText = `Loaded ${this.groups.length} groups`;
          }
          
          // Show completion message briefly
          setTimeout(() => {
            this.progressText = '';
          }, 2000);

          // Load and calculate average ratings (this will also update filteredGroups)
          this.refreshAverageRatings();

          // Save to cache
          const selectedNicknames: { [key: string]: string } = {};
          this.groups.forEach(group => {
            if (group.groupNickname && group.groupNickname.trim()) {
              selectedNicknames[group.groupId] = group.groupNickname;
            }
          });
          this.cacheService.setPromptGroupingData(
            this.folderPath,
            this.groups,
            this.filteredGroups,
            this.filterText,
            selectedNicknames
          );
        } else {
          this.error = 'Failed to load prompt groups';
          this.isLoading = false;
          this.showProgress = false;
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load groups from folder';
        this.isLoading = false;
        console.error('Error loading groups:', err);
      }
    });
  }

  /**
   * Format latest modification date for display
   * Uses local timezone for accurate date comparisons
   */
  formatLatestModifiedDate(group: PromptGroupInfo): string {
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

  openImageViewer(group: PromptGroupInfo): void {
    console.log('[PromptGrouping] openImageViewer called for group:', group.groupId);
    console.log('[PromptGrouping] folderPath:', this.folderPath);
    
    // Load ratings from server if they exist
    this.groupingService.loadRatings(this.folderPath).subscribe({
      next: (response) => {
        console.log('[PromptGrouping] Ratings loaded:', response);
        if (response.success) {
          // Ratings are now stored flat by filename (basename only): { filename: rating }
          const allRatings = response.ratings as { [filename: string]: number };
          console.log('[PromptGrouping] All ratings keys:', Object.keys(allRatings));
          
          // Filter to only ratings for images in this group
          const groupRatings: { [filename: string]: number } = {};
          if (group.images && allRatings) {
            group.images.forEach(fullPath => {
              // Extract basename since ratings are stored by basename only
              const basename = fullPath.includes('/') ? fullPath.split('/').pop()! : fullPath;
              console.log('[PromptGrouping] Checking image:', fullPath, '-> basename:', basename);
              if (allRatings[basename]) {
                groupRatings[basename] = allRatings[basename];
                console.log('[PromptGrouping] Found rating for', basename, ':', allRatings[basename]);
              }
            });
          }
          
          this.currentGroupReviewData = {
            images: group.images,
            folder: this.folderPath,
            title: `Group ${group.groupId}`,
            apiType: 'prompt-grouping',
            imageRatings: groupRatings,
            // Store additional metadata for display
            additionalData: {
              normalizedPrompt: group.normalizedPrompt,
              sampleOriginalPrompt: group.sampleOriginalPrompt
            }
          };
          console.log('[PromptGrouping] Review data set with images:', group.images);
          console.log('[PromptGrouping] Total images in group:', group.images.length);
          
          // Check for duplicates
          const uniqueImages = new Set(group.images);
          if (uniqueImages.size !== group.images.length) {
            console.warn('[PromptGrouping] ⚠️ DUPLICATE IMAGES IN GROUP!');
            console.warn('[PromptGrouping] Received:', group.images.length, 'Unique:', uniqueImages.size);
            console.warn('[PromptGrouping] Images:', group.images);
          }
          
          console.log('[PromptGrouping] Review data set with ratings:', this.currentGroupReviewData.imageRatings);
          this.showImageViewer = true;
        }
      },
      error: (err) => {
        console.error('[PromptGrouping] Failed to load ratings:', err);
        // Still open the viewer, just without ratings
        this.currentGroupReviewData = {
          images: group.images,
          folder: this.folderPath,
          title: `Group ${group.groupId}`,
          apiType: 'prompt-grouping',
          imageRatings: {},
          additionalData: {
            normalizedPrompt: group.normalizedPrompt,
            sampleOriginalPrompt: group.sampleOriginalPrompt
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
    console.log('[PromptGrouping] Ratings changed:', ratings);
    this.latestModalRatings = ratings;
    if (this.currentGroupReviewData) {
      this.currentGroupReviewData.imageRatings = ratings;
      console.log('[PromptGrouping] Stored ratings in review data:', this.currentGroupReviewData.imageRatings);
    }
  }

  closeImageViewer(): void {
    console.log('[PromptGrouping] Closing image viewer');
    console.log('[PromptGrouping] Current review data:', this.currentGroupReviewData);
    console.log('[PromptGrouping] Latest modal ratings:', this.latestModalRatings);
    
    // Use ratings from either currentGroupReviewData or latestModalRatings
    const ratingsToUse = this.latestModalRatings || (this.currentGroupReviewData?.imageRatings);
    
    // Save ratings back to server before closing
    // IMPORTANT: MERGE new ratings with existing ones to prevent data loss
    // We only have ratings for the current group, but all ratings exist in the file
    if (ratingsToUse !== undefined && ratingsToUse !== null) {
      console.log('[PromptGrouping] Ratings from modal:', ratingsToUse);
      
      // MERGE: Load all existing ratings first, then merge with modal ratings
      this.groupingService.loadRatings(this.folderPath).subscribe({
        next: (loadResponse) => {
          const allExistingRatings = (loadResponse.success && loadResponse.ratings) ? loadResponse.ratings : {};
          console.log('[PromptGrouping] All existing ratings:', allExistingRatings);
          
          // Merge: keep all existing ratings, update with new ones from modal
          const mergedRatings = { ...allExistingRatings, ...ratingsToUse };
          console.log('[PromptGrouping] Merged ratings:', mergedRatings);
          
          // Now save the MERGED ratings
          this.groupingService.saveRatings(this.folderPath, mergedRatings).subscribe({
            next: (response) => {
              console.log('[PromptGrouping] Ratings saved successfully:', response);
              // Notify other components about the ratings update
              this.ratingsStateService.notifyRatingsSaved(this.folderPath, mergedRatings);
              // Refresh average ratings for display
              this.refreshAverageRatings();
            },
            error: (err) => {
              console.error('[PromptGrouping] Failed to save ratings:', err);
              // Still refresh to update the UI
              this.refreshAverageRatings();
            }
          });
        },
        error: (err) => {
          console.warn('[PromptGrouping] Failed to load existing ratings, saving modal ratings only:', err);
          // If we can't load existing, just save what we have from modal
          this.groupingService.saveRatings(this.folderPath, ratingsToUse as { [filename: string]: number }).subscribe({
            next: (response) => {
              console.log('[PromptGrouping] Ratings saved successfully:', response);
              this.ratingsStateService.notifyRatingsSaved(this.folderPath, ratingsToUse as { [filename: string]: number });
              this.refreshAverageRatings();
            },
            error: (err2) => {
              console.error('[PromptGrouping] Failed to save ratings:', err2);
              this.refreshAverageRatings();
            }
          });
        }
      });
    } else {
      console.log('[PromptGrouping] No ratings to save');
      this.refreshAverageRatings();
    }

    this.showImageViewer = false;
    this.currentGroupReviewData = null;
    this.latestModalRatings = null;
  }

  getThumbnailUrl(group: PromptGroupInfo): string {
    return this.groupingService.getThumbnailUrl(
      this.folderPath,
      group.images[0]
    );
  }

  /**
   * Open the folder in the system file explorer
   */
  async openFolderInFinder(): Promise<void> {
    if (!this.folderPath) {
      this.error = 'Please select a folder first';
      return;
    }

    try {
      const response = await this.groupingService.openFolderInFinder(this.folderPath);
      if (!response.success) {
        this.error = 'Failed to open folder: ' + (response.error || 'Unknown error');
      }
    } catch (err) {
      this.error = 'Error opening folder: ' + (err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Start editing nickname for a group
   */
  startEditingNickname(group: PromptGroupInfo): void {
    this.editingGroupId = group.groupId;
    this.editingNickname = group.groupNickname || '';
    this.selectedSuggestionIndex = -1;
    this.updateFilteredEditingNicknames();
  }

  /**
   * Cancel nickname editing
   */
  cancelEditingNickname(): void {
    this.editingGroupId = null;
    this.editingNickname = '';
    this.showNicknameAssignDropdown = false;
    this.selectedSuggestionIndex = -1;
  }

  /**
   * Toggle nickname assignment dropdown (for editing)
   */
  toggleNicknameAssignDropdown(): void {
    // Before showing dropdown, ensure current editing nickname is in the list if it's new
    if (this.editingNickname.trim()) {
      this.addNicknameToAvailable(this.editingNickname);
    }
    this.showNicknameAssignDropdown = !this.showNicknameAssignDropdown;
  }

  /**
   * Update filtered nicknames based on current editing input
   */
  updateFilteredEditingNicknames(): void {
    if (!this.editingNickname.trim()) {
      // Show all available nicknames if input is empty
      this.filteredEditingNicknames = [...this.availableNicknames];
      return;
    }

    const searchTerm = this.editingNickname.toLowerCase().trim();
    this.filteredEditingNicknames = this.availableNicknames.filter(nickname =>
      nickname.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Handle editing nickname input change
   */
  onEditingNicknameChange(): void {
    this.updateFilteredEditingNicknames();
    // Auto-show dropdown if user has typed something (even if no matches)
    if (this.editingNickname.trim()) {
      this.showNicknameAssignDropdown = true;
      this.selectedSuggestionIndex = -1; // Reset selection when filter changes
    }
  }

  /**
   * Handle keyboard navigation in nickname suggestions
   */
  onNicknameInputKeydown(event: KeyboardEvent, groupId: number): void {
    // Special handling for Enter key - allow custom nicknames
    if (event.key === 'Enter') {
      event.preventDefault();
      // If a suggestion is selected, use it
      if (this.selectedSuggestionIndex >= 0 && this.selectedSuggestionIndex < this.filteredEditingNicknames.length) {
        const selectedNickname = this.filteredEditingNicknames[this.selectedSuggestionIndex];
        this.assignNicknameFromDropdown(selectedNickname);
      } else if (this.editingNickname.trim()) {
        // Otherwise, save the custom nickname entered
        this.showNicknameAssignDropdown = false;
      }
      this.saveGroupNickname(groupId);
      return;
    }

    // Handle Escape key
    if (event.key === 'Escape') {
      event.preventDefault();
      this.showNicknameAssignDropdown = false;
      this.selectedSuggestionIndex = -1;
      return;
    }

    // Handle Tab and Arrow keys only if dropdown is visible with suggestions
    if (!this.showNicknameAssignDropdown || this.filteredEditingNicknames.length === 0) {
      if (event.key === 'Tab') {
        // Allow Tab to navigate normally if no dropdown
        return;
      }
      return;
    }

    switch (event.key) {
      case 'Tab':
      case 'ArrowDown':
        event.preventDefault();
        // Move to next suggestion
        if (this.selectedSuggestionIndex < this.filteredEditingNicknames.length - 1) {
          this.selectedSuggestionIndex++;
        } else {
          this.selectedSuggestionIndex = 0; // Wrap around
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        // Move to previous suggestion
        if (this.selectedSuggestionIndex > 0) {
          this.selectedSuggestionIndex--;
        } else {
          this.selectedSuggestionIndex = this.filteredEditingNicknames.length - 1; // Wrap around
        }
        break;
    }
  }

  /**
   * Assign a nickname from the dropdown to the currently editing group
   */
  assignNicknameFromDropdown(nickname: string): void {
    this.editingNickname = nickname;
    this.showNicknameAssignDropdown = false;
    // Auto-save after assigning from dropdown
    setTimeout(() => {
      if (this.editingGroupId !== null) {
        this.saveGroupNickname(this.editingGroupId);
      }
    }, 0);
  }

  /**
   * Add newly entered nickname to available nicknames if not already there
   */
  private addNicknameToAvailable(nickname: string): void {
    if (nickname.trim() && !this.availableNicknames.includes(nickname.trim())) {
      this.availableNicknames.push(nickname.trim());
      this.availableNicknames.sort(); // Keep alphabetically sorted
    }
  }

  /**
   * Save nickname for a group
   */
  saveGroupNickname(groupId: number): void {
    if (this.editingGroupId !== groupId) {
      return;
    }

    this.savingNickname = true;

    this.groupingService.setGroupNickname(this.folderPath, groupId, this.editingNickname).subscribe({
      next: (response) => {
        if (response.success) {
          // Update the group in the local array
          const group = this.groups.find(g => g.groupId === groupId);
          if (group) {
            group.groupNickname = response.nickname;
          }
          // Add the new nickname to available nicknames
          this.addNicknameToAvailable(this.editingNickname);
          this.cancelEditingNickname();
        }
        this.savingNickname = false;
      },
      error: (err) => {
        this.error = 'Failed to save nickname: ' + (err.error?.error || 'Unknown error');
        this.savingNickname = false;
        console.error('Error saving nickname:', err);
      }
    });
  }

  /**
   * Get display name for a group (nickname if set, otherwise Group ID)
   */
  getGroupDisplayName(group: PromptGroupInfo): string {
    if (group.groupNickname && group.groupNickname.trim()) {
      return group.groupNickname;
    }
    return `Group ${group.groupId}`;
  }

  /**
   * Toggle filter panel visibility
   */
  toggleFilterPanel(): void {
    this.showFilters = !this.showFilters;
  }

  /**
   * Apply filter to groups based on nickname, Group ID, and prompt text (case-insensitive)
   * Supports multiple search terms separated by commas (AND logic - match ALL terms)
   * Supports exclusion filters by prefixing with "-" (e.g., "-red, blue" = includes blue but NOT red)
   * Also supports filtering for groups with no nickname and filtering/sorting by average rating
   */
  applyFilter(): void {
    // First, apply the no-nickname filter if enabled
    let baseGroups = this.groups;
    if (this.showOnlyNoNickname) {
      baseGroups = this.groups.filter(group => !group.groupNickname || !group.groupNickname.trim());
    }

    // Apply rating filter
    if (this.minAverageRating > 0) {
      baseGroups = baseGroups.filter(group => 
        group.averageRating !== undefined && group.averageRating >= this.minAverageRating
      );
    }

    // Then apply the text filter if there's search text
    if (!this.filterText.trim()) {
      this.filteredGroups = baseGroups;
    } else {
      // Split by comma and trim each term
      const allTerms = this.filterText
        .split(',')
        .map(term => term.toLowerCase().trim())
        .filter(term => term.length > 0);

      if (allTerms.length === 0) {
        this.filteredGroups = baseGroups;
      } else {
        // Separate inclusion and exclusion terms
        const inclusionTerms = allTerms.filter(term => !term.startsWith('-'));
        const exclusionTerms = allTerms.filter(term => term.startsWith('-')).map(term => term.substring(1)); // Remove the "-" prefix

        this.filteredGroups = baseGroups.filter(group => {
          const nickname = group.groupNickname ? group.groupNickname.toLowerCase() : '';
          const groupIdStr = group.groupId.toString();
          const normalizedPrompt = group.normalizedPrompt ? group.normalizedPrompt.toLowerCase() : '';
          const samplePrompt = group.sampleOriginalPrompt ? group.sampleOriginalPrompt.toLowerCase() : '';
          
          const searchFields = [nickname, groupIdStr, normalizedPrompt, samplePrompt];
          
          // If there are inclusion terms, ALL must match in any field (AND logic)
          if (inclusionTerms.length > 0) {
            const matchesInclusionTerms = inclusionTerms.every(term =>
              searchFields.some(field => field.includes(term))
            );
            if (!matchesInclusionTerms) {
              return false;
            }
          }
          
          // If there are exclusion terms, NONE should match in any field
          if (exclusionTerms.length > 0) {
            const matchesExclusionTerms = exclusionTerms.some(term =>
              searchFields.some(field => field.includes(term))
            );
            if (matchesExclusionTerms) {
              return false;
            }
          }
          
          return true;
        });
      }
    }

    // Apply rating sort if enabled
    if (this.sortByRating === 'desc') {
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

    // Save to cache
    const selectedNicknames: { [key: string]: string } = {};
    this.groups.forEach(group => {
      if (group.groupNickname && group.groupNickname.trim()) {
        selectedNicknames[group.groupId] = group.groupNickname;
      }
    });
    this.cacheService.setPromptGroupingData(
      this.folderPath,
      this.groups,
      this.filteredGroups,
      this.filterText,
      selectedNicknames
    );
  }

  /**
   * Toggle the "show only no nickname" filter
   */
  toggleShowOnlyNoNickname(): void {
    this.showOnlyNoNickname = !this.showOnlyNoNickname;
    this.applyFilter();
  }

  /**
   * Clear filter and show all groups
   */
  clearFilter(): void {
    this.filterText = '';
    this.showOnlyNoNickname = false;
    this.filteredGroups = this.groups;

    // Save to cache
    const selectedNicknames: { [key: string]: string } = {};
    this.groups.forEach(group => {
      if (group.groupNickname && group.groupNickname.trim()) {
        selectedNicknames[group.groupId] = group.groupNickname;
      }
    });
    this.cacheService.setPromptGroupingData(
      this.folderPath,
      this.groups,
      this.filteredGroups,
      this.filterText,
      selectedNicknames
    );
  }

  /**
   * Handle filter input change
   */
  onFilterChange(): void {
    this.applyFilter();
  }

  /**
   * Extract all unique nicknames from groups
   */
  extractAvailableNicknames(): void {
    const nicknameSet = new Set<string>();
    this.groups.forEach(group => {
      if (group.groupNickname && group.groupNickname.trim()) {
        nicknameSet.add(group.groupNickname.trim());
      }
    });
    // Sort nicknames alphabetically
    this.availableNicknames = Array.from(nicknameSet).sort();
  }

  /**
   * Toggle nickname dropdown visibility
   */
  toggleNicknameDropdown(): void {
    this.showNicknameDropdown = !this.showNicknameDropdown;
  }

  /**
   * Select a nickname from dropdown and filter
   */
  selectNickname(nickname: string): void {
    this.filterText = nickname;
    this.showNicknameDropdown = false;
    this.applyFilter();
  }

  /**
   * Close nickname dropdown when clicking outside
   */
  closeNicknameDropdown(): void {
    this.showNicknameDropdown = false;
  }

  /**
   * Toggle bulk nickname assignment dropdown
   */
  toggleBulkAssignDropdown(): void {
    this.showBulkAssignDropdown = !this.showBulkAssignDropdown;
    if (this.showBulkAssignDropdown) {
      this.updateFilteredBulkNicknames();
    }
  }

  /**
   * Update filtered nicknames for bulk assignment based on input
   */
  updateFilteredBulkNicknames(): void {
    if (!this.bulkAssignNickname.trim()) {
      this.filteredBulkAssignNicknames = [...this.availableNicknames];
      return;
    }

    const searchTerm = this.bulkAssignNickname.toLowerCase().trim();
    this.filteredBulkAssignNicknames = this.availableNicknames.filter(nickname =>
      nickname.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Handle bulk assignment input change
   */
  onBulkAssignInputChange(): void {
    this.updateFilteredBulkNicknames();
    if (this.bulkAssignNickname.trim() && this.filteredBulkAssignNicknames.length > 0) {
      this.showBulkAssignDropdown = true;
      this.selectedBulkIndex = -1;
    }
  }

  /**
   * Select nickname for bulk assignment
   */
  selectBulkNickname(nickname: string): void {
    this.bulkAssignNickname = nickname;
    this.showBulkAssignDropdown = false;
  }

  /**
   * Assign the same nickname to all filtered groups with progress tracking
   */
  assignNicknameToAllFiltered(): void {
    if (!this.bulkAssignNickname.trim()) {
      this.error = 'Please enter or select a nickname';
      return;
    }

    if (this.filteredGroups.length === 0) {
      this.error = 'No groups to assign nickname to';
      return;
    }

    this.isAssigningBulkNickname = true;
    this.bulkAssignProgress = 0;
    this.bulkAssignProgressText = '0%';
    this.error = null;

    const nicknameToAssign = this.bulkAssignNickname.trim();
    const totalGroups = this.filteredGroups.length;
    let completedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // Use mergeMap with concurrency limit (5 parallel requests at a time)
    from(this.filteredGroups)
      .pipe(
        mergeMap(
          group =>
            this.groupingService.setGroupNickname(this.folderPath, group.groupId, nicknameToAssign).pipe(
              map(response => ({ response, group })),
              catchError(err => of({ response: { success: false }, group, error: err }))
            ),
          5 // 5 concurrent requests
        ),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          completedCount++;
          const { response, group } = result;

          if (response.success) {
            group.groupNickname = response.nickname;
            // Also update in the main groups array
            const mainGroup = this.groups.find(g => g.groupId === group.groupId);
            if (mainGroup) {
              mainGroup.groupNickname = response.nickname;
            }
            successCount++;
          } else {
            errorCount++;
          }

          // Update progress
          this.bulkAssignProgress = Math.round((completedCount / totalGroups) * 100);
          this.bulkAssignProgressText = `${this.bulkAssignProgress}% (${completedCount}/${totalGroups})`;
        },
        error: (err) => {
          this.isAssigningBulkNickname = false;
          this.error = 'Failed to assign nickname to some groups. Please try again.';
          console.error('Error during bulk assignment:', err);
        },
        complete: () => {
          this.isAssigningBulkNickname = false;
          this.bulkAssignProgress = 100;

          if (errorCount === 0) {
            // Success - update available nicknames and close dialog
            this.addNicknameToAvailable(nicknameToAssign);
            this.bulkAssignNickname = '';
            this.showBulkAssignDropdown = false;
            this.selectedBulkIndex = -1;
            this.bulkAssignProgressText = '';
            alert(`Successfully assigned "${nicknameToAssign}" to ${successCount} group(s)`);
          } else {
            this.error = `Assigned nickname to ${successCount} group(s), but ${errorCount} failed`;
            this.bulkAssignProgressText = '';
          }
        }
      });
  }

  /**
   * Handle keyboard navigation in bulk assignment dropdown
   */
  onBulkAssignKeydown(event: KeyboardEvent): void {
    if (!this.showBulkAssignDropdown || this.filteredBulkAssignNicknames.length === 0) {
      if (event.key === 'Enter' && this.bulkAssignNickname.trim()) {
        event.preventDefault();
        this.assignNicknameToAllFiltered();
      }
      return;
    }

    switch (event.key) {
      case 'Tab':
      case 'ArrowDown':
        event.preventDefault();
        if (this.selectedBulkIndex < this.filteredBulkAssignNicknames.length - 1) {
          this.selectedBulkIndex++;
        } else {
          this.selectedBulkIndex = 0;
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (this.selectedBulkIndex > 0) {
          this.selectedBulkIndex--;
        } else {
          this.selectedBulkIndex = this.filteredBulkAssignNicknames.length - 1;
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedBulkIndex >= 0 && this.selectedBulkIndex < this.filteredBulkAssignNicknames.length) {
          this.selectBulkNickname(this.filteredBulkAssignNicknames[this.selectedBulkIndex]);
        }
        this.assignNicknameToAllFiltered();
        break;

      case 'Escape':
        event.preventDefault();
        this.showBulkAssignDropdown = false;
        this.selectedBulkIndex = -1;
        break;
    }
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
    console.log('[PromptGrouping] Refreshing average ratings for folder:', this.folderPath);
    this.groupingService.loadRatings(this.folderPath).subscribe({
      next: (response) => {
        console.log('[PromptGrouping] Loaded ratings from server:', response);
        if (response.success && response.ratings) {
          // Get all image ratings from flat structure (filename: rating)
          const allImageRatings = response.ratings as { [filename: string]: number };
          console.log('[PromptGrouping] All image ratings:', allImageRatings);
          
          // Build a map of basename -> rating to handle both old (full prompt) and new (basename) formats
          const basenameToRating: { [basename: string]: number } = {};
          Object.keys(allImageRatings).forEach(key => {
            // Extract basename from key (could be "s-227156113.png" or "1girl, ... s-227156113.png")
            // The basename is always "s-<seed>.png" format
            const match = key.match(/(s-\d+\.png)$/i);
            if (match) {
              const basename = match[1];
              basenameToRating[basename] = allImageRatings[key];
            } else {
              // Fallback: if no match, assume key is already a basename
              basenameToRating[key] = allImageRatings[key];
            }
          });
          
          console.log('[PromptGrouping] Basename to rating map:', basenameToRating);
          
          this.groups.forEach(group => {
            const oldRating = group.averageRating;
            
            // Calculate average based on images in this group
            if (group.images && group.images.length > 0) {
              // Convert array of filenames to object of {filename: rating}
              const groupRatingsObj: { [filename: string]: number } = {};
              group.images.forEach((fullPath: string) => {
                // Extract the seed-based basename from the full filename
                // e.g., "1girl, {{...}} s-227156113.png" -> "s-227156113.png"
                const basenameMatch = fullPath.match(/(s-\d+(?:\s+\(\d+\))?\.png)$/i);
                const basename = basenameMatch ? basenameMatch[1] : fullPath;
                if (basenameToRating[basename]) {
                  groupRatingsObj[fullPath] = basenameToRating[basename];
                }
              });
              
              group.averageRating = this.calculateAverageRating(groupRatingsObj);
              const ratedCount = Object.keys(groupRatingsObj).length;
              console.log(`[PromptGrouping] Group ${group.groupId}: images=${group.images.length}, rated=${ratedCount}, average=${group.averageRating} (was ${oldRating})`);
            }
          });

          // Re-apply the existing filter to update display with new average ratings
          // This preserves any active filters (search text, no-nickname toggle, etc.)
          this.applyFilter();
          console.log('[PromptGrouping] Average ratings refreshed, filtered to', this.filteredGroups.length, 'groups');
        }
      },
      error: (err) => {
        console.error('[PromptGrouping] Failed to load ratings:', err);
      }
    });
  }

  /**
   * Handle minimum average rating filter change
   */
  onMinAverageRatingChange(): void {
    this.applyFilter();
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
    this.applyFilter();
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
}
