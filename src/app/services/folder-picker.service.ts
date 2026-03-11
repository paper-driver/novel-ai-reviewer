import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Service to handle folder selection via native picker or user input
 * First attempts native system dialog, falls back to manual path entry
 */
@Injectable({
  providedIn: 'root'
})
export class FolderPickerService {

  constructor(private http: HttpClient) { }

  /**
   * Attempt to get a folder path using native picker or fallback to manual input
   * On macOS/Windows/Linux: Tries native system folder picker first
   * Fallback: Prompts user to enter folder path manually
   */
  async pickFolder(): Promise<string | null> {
    try {
      console.log('[FolderPicker] Attempting native folder picker...');
      
      const response: any = await firstValueFrom(
        this.http.post('http://localhost:3000/api/pick-folder', {})
      );

      if (response && response.success && response.path) {
        console.log('[FolderPicker] Folder selected via native picker:', response.path);
        return response.path;
      }
      
      console.log('[FolderPicker] Native picker unavailable, using fallback');
      return this.promptForFolderPath();
    } catch (err) {
      console.warn('[FolderPicker] Native picker error, using fallback:', err);
      return this.promptForFolderPath();
    }
  }

  /**
   * Fallback: Prompt user to manually enter folder path with helpful instructions
   */
  private promptForFolderPath(): string | null {
    const message = `Please enter the full path to your folder:

Examples:
  macOS:  /Users/yourname/Desktop/photos
  Windows: C:\\Users\\yourname\\Desktop\\photos
  Linux:   /home/yourname/Desktop/photos

Tip: You can copy the path from your file manager and paste it here.`;

    const path = prompt(message);
    
    if (!path || !path.trim()) {
      console.log('[FolderPicker] User cancelled manual path entry');
      return null;
    }

    const trimmedPath = path.trim();
    console.log('[FolderPicker] Using manually entered path:', trimmedPath);
    return trimmedPath;
  }
}
