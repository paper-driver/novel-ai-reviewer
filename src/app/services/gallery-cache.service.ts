import { Injectable } from '@angular/core';
import { ArtistGroupInfo } from './artist-gallery.service';
import { PromptGroupInfo } from './prompt-grouping.service';

/**
 * Service to cache gallery and grouping data to preserve state when switching between tabs
 * Prevents need to reload data when user navigates between pages
 */
@Injectable({
  providedIn: 'root'
})
export class GalleryCacheService {
  // Artist Gallery Cache
  private artistGalleryCache: {
    folderPath: string;
    groups: ArtistGroupInfo[];
    filteredGroups: ArtistGroupInfo[];
    searchText: string;
    totalImages: number;
    minAverageRating: number;
    sortByRating: 'none' | 'asc' | 'desc';
    sortByModified: 'none' | 'asc' | 'desc';
    selectedTagFilters: string[];
  } | null = null;

  // Prompt Grouping Cache
  private promptGroupingCache: {
    generatedFolder: string;
    groups: PromptGroupInfo[];
    filteredGroups: PromptGroupInfo[];
    searchText: string;
    selectedNicknames: { [key: string]: string };
    minAverageRating: number;
    sortByRating: 'none' | 'asc' | 'desc';
    sortByModified: 'none' | 'asc' | 'desc';
    selectedTagFilters: string[];
  } | null = null;

  constructor() {}

  // ============ ARTIST GALLERY CACHE ============

  /**
   * Store artist gallery data in cache
   */
  setArtistGalleryData(
    folderPath: string,
    groups: ArtistGroupInfo[],
    filteredGroups: ArtistGroupInfo[],
    searchText: string,
    totalImages: number,
    minAverageRating: number = 0,
    sortByRating: 'none' | 'asc' | 'desc' = 'none',
    sortByModified: 'none' | 'asc' | 'desc' = 'none',
    selectedTagFilters: string[] = []
  ): void {
    this.artistGalleryCache = {
      folderPath,
      groups,
      filteredGroups,
      searchText,
      totalImages,
      minAverageRating,
      sortByRating,
      sortByModified,
      selectedTagFilters
    };
  }

  /**
   * Get cached artist gallery data, if available
   */
  getArtistGalleryData(): {
    folderPath: string;
    groups: ArtistGroupInfo[];
    filteredGroups: ArtistGroupInfo[];
    searchText: string;
    totalImages: number;
    minAverageRating: number;
    sortByRating: 'none' | 'asc' | 'desc';
    sortByModified: 'none' | 'asc' | 'desc';
    selectedTagFilters: string[];
  } | null {
    return this.artistGalleryCache;
  }

  /**
   * Clear artist gallery cache
   */
  clearArtistGalleryCache(): void {
    this.artistGalleryCache = null;
  }

  /**
   * Check if artist gallery cache exists
   */
  hasArtistGalleryCache(): boolean {
    return this.artistGalleryCache !== null && this.artistGalleryCache.groups.length > 0;
  }

  // ============ PROMPT GROUPING CACHE ============

  /**
   * Store prompt grouping data in cache
   */
  setPromptGroupingData(
    generatedFolder: string,
    groups: PromptGroupInfo[],
    filteredGroups: PromptGroupInfo[],
    searchText: string,
    selectedNicknames: { [key: string]: string },
    minAverageRating: number = 0,
    sortByRating: 'none' | 'asc' | 'desc' = 'none',
    sortByModified: 'none' | 'asc' | 'desc' = 'none',
    selectedTagFilters: string[] = []
  ): void {
    this.promptGroupingCache = {
      generatedFolder,
      groups,
      filteredGroups,
      searchText,
      selectedNicknames,
      minAverageRating,
      sortByRating,
      sortByModified,
      selectedTagFilters
    };
  }

  /**
   * Get cached prompt grouping data, if available
   */
  getPromptGroupingData(): {
    generatedFolder: string;
    groups: PromptGroupInfo[];
    filteredGroups: PromptGroupInfo[];
    searchText: string;
    selectedNicknames: { [key: string]: string };
    minAverageRating: number;
    sortByRating: 'none' | 'asc' | 'desc';
    sortByModified: 'none' | 'asc' | 'desc';
    selectedTagFilters: string[];
  } | null {
    return this.promptGroupingCache;
  }

  /**
   * Clear prompt grouping cache
   */
  clearPromptGroupingCache(): void {
    this.promptGroupingCache = null;
  }

  /**
   * Check if prompt grouping cache exists
   */
  hasPromptGroupingCache(): boolean {
    return this.promptGroupingCache !== null && this.promptGroupingCache.groups.length > 0;
  }

  // ============ GENERAL CACHE MANAGEMENT ============

  /**
   * Clear all cached data
   */
  clearAllCache(): void {
    this.artistGalleryCache = null;
    this.promptGroupingCache = null;
  }
}
