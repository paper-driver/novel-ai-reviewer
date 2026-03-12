import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PromptGroupInfo {
  groupId: number;
  groupName: string;
  groupNickname?: string;
  normalizedPrompt: string;
  sampleOriginalPrompt: string;
  images: string[];
  imageCount: number;
  thumbnailPath: string;
  latestModifiedTime?: number;
}

export interface PromptGroupingResult {
  success: boolean;
  folder: string;
  groups: PromptGroupInfo[];
  totals: {
    groups: number;
    images: number;
  };
  cached?: boolean;
}

export interface ImageMetadata {
  filename: string;
  originalPrompt: string;
  normalizedPrompt: string;
  artists: string[];
  generationData: any;
}

export interface OpenFolderResponse {
  success: boolean;
  error?: string;
}

export interface LoadingProgress {
  status: 'idle' | 'processing';
  totalFiles: number;
  processedFiles: number;
  percentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class PromptGroupingService {

  constructor(private http: HttpClient) { }

  /**
   * Load all prompt groups from a folder
   */
  loadPromptGroups(folderPath: string, useCache: boolean = true): Observable<PromptGroupingResult> {
    return this.http.post<PromptGroupingResult>(
      'http://localhost:3000/api/prompt-grouping/load-groups',
      { folderPath: folderPath, useCache: useCache }
    );
  }

  /**
   * Get loading progress for a folder
   */
  getLoadingProgress(folderPath: string): Observable<LoadingProgress> {
    return this.http.get<LoadingProgress>(
      `http://localhost:3000/api/prompt-grouping/progress?folderPath=${encodeURIComponent(folderPath)}`
    );
  }

  /**
   * Get images from a specific prompt group folder
   */
  getGroupImages(folderPath: string): Observable<{ images: string[] }> {
    return this.http.post<{ images: string[] }>(
      'http://localhost:3000/api/prompt-grouping/group-images',
      { folderPath }
    );
  }

  /**
   * Get metadata for a specific image
   */
  getImageMetadata(filePath: string): Observable<ImageMetadata> {
    return this.http.get<ImageMetadata>(
      `http://localhost:3000/api/prompt-grouping/image-metadata?filePath=${encodeURIComponent(filePath)}`
    );
  }

  /**
   * Get thumbnail URL for an image (loads optimized partial file for faster display)
   */
  getThumbnailUrl(folderPath: string, filename: string): string {
    const fullFilePath = `${folderPath}/${filename}`;
    // Add cache-busting parameter to force fresh download and bypass stale cached partial files
    const cacheBuster = 'v2';
    return `http://localhost:3000/api/prompt-grouping/image?filePath=${encodeURIComponent(fullFilePath)}&thumbnail=true&v=${cacheBuster}`;
  }

  /**
   * Get full image URL
   */
  getImageUrl(folderPath: string, filename: string): string {
    const fullFilePath = `${folderPath}/${filename}`;
    return `http://localhost:3000/api/prompt-grouping/image?filePath=${encodeURIComponent(fullFilePath)}`;
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
   * Set a nickname for a prompt group
   */
  setGroupNickname(folderPath: string, groupId: number, nickname: string): Observable<any> {
    return this.http.post<any>(
      'http://localhost:3000/api/prompt-grouping/set-nickname',
      { folderPath, groupId, nickname }
    );
  }
}
