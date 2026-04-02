import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UrlEncodePipe } from '../../pipes/url-encode.pipe';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Base Image Manager Component
 * Allows users to upload and manage base images in the genericBaseImages folder
 * These images are reused across multiple artist generations
 */
@Component({
  selector: 'app-base-image-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, UrlEncodePipe],
  templateUrl: './base-image-manager.component.html',
  styleUrls: ['./base-image-manager.component.scss']
})
export class BaseImageManagerComponent implements OnInit, OnChanges {
  @Input() registryFolder: string = '';

  // Observables
  baseImages$ = new BehaviorSubject<any[]>([]);
  isLoading$ = new BehaviorSubject<boolean>(false);
  error$ = new BehaviorSubject<string | null>(null);
  success$ = new BehaviorSubject<string | null>(null);

  selectedFile: File | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // Load base images when component initializes
    if (this.registryFolder) {
      this.loadBaseImages();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload images when registryFolder input changes
    if (changes['registryFolder'] && !changes['registryFolder'].firstChange) {
      this.loadBaseImages();
    }
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  /**
   * Upload selected file as base image
   */
  uploadBaseImage(): void {
    if (!this.selectedFile || !this.registryFolder) {
      this.error$.next('Please select both a file and registry folder');
      return;
    }

    this.isLoading$.next(true);
    this.error$.next(null);
    this.success$.next(null);

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const base64 = e.target.result.split(',')[1]; // Remove data:image/png;base64, prefix

      const payload = {
        imageBase64: base64,
        filename: this.selectedFile!.name,
        registryFolder: this.registryFolder
      };

      this.http.post('http://localhost:3001/api/base-images/upload', payload)
        .subscribe({
          next: (response: any) => {
            this.success$.next(`Image uploaded successfully: ${this.selectedFile!.name}`);
            this.selectedFile = null;
            this.loadBaseImages();
            this.isLoading$.next(false);
          },
          error: (error) => {
            this.error$.next(`Upload failed: ${error.error?.details || error.message}`);
            this.isLoading$.next(false);
          }
        });
    };

    reader.readAsDataURL(this.selectedFile);
  }

  /**
   * Load list of base images from registry
   */
  loadBaseImages(): void {
    if (!this.registryFolder) {
      return;
    }

    this.isLoading$.next(true);

    this.http.get(`http://localhost:3001/api/base-images/list?registryFolder=${encodeURIComponent(this.registryFolder)}`)
      .subscribe({
        next: (response: any) => {
          this.baseImages$.next(response.images || []);
          this.isLoading$.next(false);
        },
        error: (error) => {
          this.error$.next(`Failed to load images: ${error.message}`);
          this.isLoading$.next(false);
        }
      });
  }

  /**
   * Delete a base image
   */
  deleteBaseImage(filename: string): void {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    this.http.delete(`http://localhost:3001/api/base-images/${filename}?registryFolder=${encodeURIComponent(this.registryFolder)}`)
      .subscribe({
        next: (response: any) => {
          this.success$.next(response.message);
          this.loadBaseImages();
        },
        error: (error) => {
          this.error$.next(`Delete failed: ${error.message}`);
        }
      });
  }

  /**
   * Set registry folder and load images
   */
  setRegistryFolder(folder: string): void {
    this.registryFolder = folder;
    this.loadBaseImages();
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  /**
   * Handle image load error - show placeholder
   */
  onImageLoadError(event: any): void {
    event.target.style.display = 'none';
    const placeholder = event.target.nextElementSibling;
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  }
}
