import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ArtistGroupInfo {
  folderName: string;
  folderPath: string;
  artistKey: string;
  artists: string[];
  imageCount: number;
  thumbnailPath: string;
  images: string[];
  latestModifiedTime?: number; // Unix timestamp (ms) of latest modified image
  averageRating?: number; // Average rating for images in this group (0-10, or undefined if no ratings)
}

export interface ArtistGalleryResult {
  success: boolean;
  sortedFolder: string;
  baseFolder?: string;  // Parent folder where ratings are stored
  groups: ArtistGroupInfo[];
  totalGroups: number;
  totalImages: number;
}

export interface ImageMetadata {
  filename: string;
  prompt: string;
  artists: string[];
  generationData: any;
}

export interface OpenFolderResponse {
  success: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ArtistGalleryService {

  constructor(private http: HttpClient) { }

  /**
   * Load all artist groups from a sorted folder
   */
  loadArtistGroups(sortedFolderPath: string): Observable<ArtistGalleryResult> {
    return this.http.post<ArtistGalleryResult>(
      'http://localhost:3000/api/artist-gallery/load-groups',
      { folderPath: sortedFolderPath }
    );
  }

  /**
   * Get images from a specific artist group folder
   */
  getGroupImages(folderPath: string): Observable<{ images: string[] }> {
    return this.http.post<{ images: string[] }>(
      'http://localhost:3000/api/artist-gallery/group-images',
      { folderPath }
    );
  }

  /**
   * Get metadata for a specific image
   */
  getImageMetadata(folderPath: string, filename: string): Observable<ImageMetadata> {
    const fullFilePath = `${folderPath}/${filename}`;
    return this.http.get<ImageMetadata>(
      `http://localhost:3000/api/artist-gallery/image-metadata?filePath=${encodeURIComponent(fullFilePath)}`
    );
  }

  /**
   * Get thumbnail URL for an image (loads optimized partial file for faster display)
   */
  getThumbnailUrl(folderPath: string, filename: string): string {
    const fullFilePath = `${folderPath}/${filename}`;
    // Add cache-busting parameter to force fresh download and bypass stale cached partial files
    const cacheBuster = 'v2';
    return `http://localhost:3000/api/artist-gallery/image?filePath=${encodeURIComponent(fullFilePath)}&thumbnail=true&v=${cacheBuster}`;
  }

  /**
   * Get full image URL
   */
  getImageUrl(folderPath: string, filename: string): string {
    const fullFilePath = `${folderPath}/${filename}`;
    return `http://localhost:3000/api/artist-gallery/image?filePath=${encodeURIComponent(fullFilePath)}`;
  }

  /**
   * Open a folder in the system file explorer
   */
  async openFolderInFinder(folderPath: string): Promise<OpenFolderResponse> {
    try {
      const response = await this.http.post<OpenFolderResponse>(
        'http://localhost:3000/api/open-folder',
        { path: folderPath }
      ).toPromise();
      return response || { success: false, error: 'No response from server' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error opening folder'
      };
    }
  }

  /**
   * Copy artist groups and images from source sorted folder to destination folder
   * Merges artist mapping files and copies all image files and folders
   */
  copyFromSourceFolder(sourcePath: string, destinationPath: string): Observable<{ 
    success: boolean; 
    message: string; 
    copiedGroups?: number;
    copiedImages?: number;
    mergedMapping?: boolean;
    error?: string;
  }> {
    return this.http.post<any>(
      'http://localhost:3000/api/artist-gallery/copy-from-source',
      { sourcePath, destinationPath }
    );
  }

  /**
   * Save image ratings for an artist group
   * Ratings are stored in a separate file: .image-ratings.json (unified for all grouping types)
   * Using flat structure: { filename: rating } so ratings are universal across all features
   */
  saveRatings(folderPath: string, ratings: { [filename: string]: number }): Observable<any> {
    console.log('[ArtistGalleryService] Saving ratings:', { folderPath, ratings });
    return this.http.post<any>(
      'http://localhost:3000/api/ratings/save',
      { folderPath, ratings }
    );
  }

  /**
   * Load image ratings for an artist group
   * Ratings are loaded from the file: .image-ratings.json (unified for all grouping types)
   * Using flat structure: { filename: rating } so ratings are universal across all features
   */
  loadRatings(folderPath: string): Observable<{ success: boolean; ratings: { [filename: string]: number } }> {
    console.log('[ArtistGalleryService] Loading ratings from:', folderPath);
    return this.http.get<any>(
      `http://localhost:3000/api/ratings/load?folderPath=${encodeURIComponent(folderPath)}`
    );
  }
}
