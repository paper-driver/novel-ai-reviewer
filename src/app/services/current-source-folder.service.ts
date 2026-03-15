import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Service to track the currently selected source folder across the entire application
 * This allows components like the AI Corrections Widget to know which folder is active
 */
@Injectable({
  providedIn: 'root'
})
export class CurrentSourceFolderService {
  private sourceFolderSubject = new BehaviorSubject<string | null>(null);
  public sourceFolder$ = this.sourceFolderSubject.asObservable();

  constructor() {}

  /**
   * Set the current source folder
   */
  setSourceFolder(folderPath: string): void {
    console.log('[CurrentSourceFolderService] Setting source folder to:', folderPath);
    this.sourceFolderSubject.next(folderPath);
  }

  /**
   * Get the current source folder
   */
  getSourceFolder(): string | null {
    return this.sourceFolderSubject.value;
  }

  /**
   * Clear the source folder
   */
  clearSourceFolder(): void {
    console.log('[CurrentSourceFolderService] Clearing source folder');
    this.sourceFolderSubject.next(null);
  }
}
