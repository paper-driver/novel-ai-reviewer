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
   * Does NOT fall back to prompt - user can manually type path in the input field
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
      
      if (response && response.cancelled) {
        console.log('[FolderPicker] User cancelled folder picker - no fallback');
        return null;
      }

      console.log('[FolderPicker] Native picker failed, returning null');
      return null;
    } catch (err) {
      console.warn('[FolderPicker] Native picker error:', err);
      return null;
    }
  }
}
