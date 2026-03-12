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
  } | null = null;

  // Prompt Grouping Cache
  private promptGroupingCache: {
    generatedFolder: string;
    groups: PromptGroupInfo[];
    filteredGroups: PromptGroupInfo[];
    searchText: string;
    selectedNicknames: { [key: string]: string };
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
    totalImages: number
  ): void {
    this.artistGalleryCache = {
      folderPath,
      groups,
      filteredGroups,
      searchText,
      totalImages
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
    selectedNicknames: { [key: string]: string }
  ): void {
    this.promptGroupingCache = {
      generatedFolder,
      groups,
      filteredGroups,
      searchText,
      selectedNicknames
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
