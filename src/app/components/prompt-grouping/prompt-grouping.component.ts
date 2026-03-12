import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { PromptGroupingService, PromptGroupInfo } from '../../services/prompt-grouping.service';
import { FolderPickerService } from '../../services/folder-picker.service';
import { ImageViewerModalComponent, ReviewImage } from '../image-viewer-modal/image-viewer-modal.component';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

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

  // Filter state
  filterText: string = '';
  showFilters = false;

  // Nickname dropdown
  availableNicknames: string[] = [];
  showNicknameDropdown = false;

  // Progress tracking
  showProgress = false;
  progressPercentage = 0;
  progressText = '';
  private destroy$ = new Subject<void>();
  private progressSubscription: any;

  constructor(
    private groupingService: PromptGroupingService,
    private folderPickerService: FolderPickerService
  ) {
    // Get user's timezone for display
    const timeZoneOffset = new Date().getTimezoneOffset();
    const hours = Math.abs(Math.floor(timeZoneOffset / 60));
    const minutes = Math.abs(timeZoneOffset % 60);
    const sign = timeZoneOffset > 0 ? '-' : '+';
    this.userTimezone = `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }
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
          this.filteredGroups = response.groups;
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
  }

  /**
   * Cancel nickname editing
   */
  cancelEditingNickname(): void {
    this.editingGroupId = null;
    this.editingNickname = '';
    this.showNicknameAssignDropdown = false;
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
   * Apply filter to groups based on nickname (case-insensitive)
   */
  applyFilter(): void {
    if (!this.filterText.trim()) {
      this.filteredGroups = this.groups;
      return;
    }

    const searchTerm = this.filterText.toLowerCase().trim();
    this.filteredGroups = this.groups.filter(group => {
      const nickname = group.groupNickname ? group.groupNickname.toLowerCase() : '';
      const groupIdStr = group.groupId.toString();
      return nickname.includes(searchTerm) || groupIdStr.includes(searchTerm);
    });
  }

  /**
   * Clear filter and show all groups
   */
  clearFilter(): void {
    this.filterText = '';
    this.filteredGroups = this.groups;
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
}
