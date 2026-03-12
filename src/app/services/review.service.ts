import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Review {
  id: number;
  prompt: string;
  review: string;
  ratings: {
    handFeet: string;
    facialExpression: string;
    genital: string;
    accessories: string;
    sideCharacter: string;
    background: string;
  };
  folder: string;
  images: string[];
  thumbnail: string;
}

export interface ArtistGroupResult {
  success: boolean;
  sourceFolder: string;
  destinationFolder: string;
  totalSourceImages: number;
  skippedCount: number;
  skippedImages: string[];
  imagesToProcess: number;
  newFoldersCreated: number;
  groups: {
    [folderName: string]: {
      artistKey: string;
      artists: string[];
      newCount: number;
      totalCount: number;
      images: string[];
    }
  };
  imageMetadata: Array<{
    filename: string;
    artists: string[];
    artistKey: string;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private apiUrl = 'http://localhost:3000/api';
  constructor(private http: HttpClient) {}

  /**
   * Create a new review with accompanying images.
   * Uses FormData for multipart submission.
   */
  createReview(formData: FormData): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/reviews`, formData);
  }

  /**
   * Retrieve reviews from the server, optionally filtering by given parameters.
   */
  getReviews(filters?: any): Observable<Review[]> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value) {
          params = params.set(key, value);
        }
      });
    }
    return this.http.get<Review[]>(`${this.apiUrl}/reviews`, { params });
  }

  /**
   * Update an existing review with new data and optional new images.
   * Uses FormData for multipart submission.
   */
  updateReview(id: number, formData: FormData): Observable<Review> {
    return this.http.put<Review>(`${this.apiUrl}/reviews/${id}`, formData);
  }

  /**
   * Delete a review by ID.
   */
  deleteReview(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/reviews/${id}`);
  }

  /**
   * Group images in a folder by artist tags from their metadata.
   * Creates subfolders for each unique artist combination.
   */
  groupImagesByArtists(folder: string): Observable<ArtistGroupResult> {
    return this.http.post<ArtistGroupResult>(`${this.apiUrl}/group-by-artists/${folder}`, {});
  }

  /**
   * Group images by artist tags with custom source and destination paths.
   * Automatically detects if source folder is pre-sorted by checking for _artist_mapping.json
   * @param sourcePath Full path to source folder containing PNG images or pre-sorted subdirectories
   * @param destinationPath Full path to destination folder where subfolders will be created
   */
  groupImagesByArtistsWithPath(sourcePath: string, destinationPath: string): Observable<ArtistGroupResult> {
    return this.http.post<ArtistGroupResult>(`${this.apiUrl}/group-by-artists-path`, {
      sourcePath,
      destinationPath
    });
  }
}