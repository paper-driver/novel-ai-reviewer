import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { PromptGroupingService, PromptGroupInfo } from '../../services/prompt-grouping.service';
import { GalleryCacheService } from '../../services/gallery-cache.service';
import { FolderPickerService } from '../../services/folder-picker.service';
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
      // Apply any filter that was active
      if (this.filterText) {
        this.applyFilter();
      }
      this.isLoading = false;
    }

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
    this.progressPercentage = 0;
    this.progressText = 'Initializing...';
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

          // Re-apply filter if there's an active filter
          if (this.filterText.trim() || this.showOnlyNoNickname) {
            this.applyFilter();
          } else {
            this.filteredGroups = response.groups;
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
    this.currentGroupReviewData = {
      images: group.images,
      folder: this.folderPath,
      title: `Group ${group.groupId}`,
      apiType: 'prompt-grouping',
      // Store additional metadata for display
      additionalData: {
        normalizedPrompt: group.normalizedPrompt,
        sampleOriginalPrompt: group.sampleOriginalPrompt
      }
    };
    this.showImageViewer = true;
  }

  closeImageViewer(): void {
    this.showImageViewer = false;
    this.currentGroupReviewData = null;
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
   * Also supports filtering for groups with no nickname
   */
  applyFilter(): void {
    // First, apply the no-nickname filter if enabled
    let baseGroups = this.groups;
    if (this.showOnlyNoNickname) {
      baseGroups = this.groups.filter(group => !group.groupNickname || !group.groupNickname.trim());
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
}
