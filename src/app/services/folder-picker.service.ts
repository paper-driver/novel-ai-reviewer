import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Service to handle folder selection via Electron native picker or backend fallback
 * First attempts Electron dialog, falls back to backend API, then manual path entry
 */
@Injectable({
  providedIn: 'root'
})
export class FolderPickerService {

  constructor(private http: HttpClient) { }

  /**
   * Attempt to get a folder path using native picker or fallback to manual input
   * On Electron: Uses Electron dialog directly
   * On web: Falls back to backend API
   */
  async pickFolder(): Promise<string | null> {
    try {
      // Try Electron API first
      const electronAPI = (window as any).electronAPI;
      console.log('[FolderPicker] electronAPI available:', !!electronAPI);
      
      if (electronAPI && electronAPI.selectFolder) {
        console.log('[FolderPicker] Using Electron dialog...');
        try {
          const result = await electronAPI.selectFolder();
          console.log('[FolderPicker] Electron result:', result);
          
          if (result && result.filePaths && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            console.log('[FolderPicker] Folder selected via Electron:', folderPath);
            return folderPath;
          }
          
          if (result && result.cancelled) {
            console.log('[FolderPicker] User cancelled folder picker');
            return null;
          }
        } catch (electronErr) {
          console.error('[FolderPicker] Electron dialog error:', electronErr);
          // Continue to fallback
        }
      } else {
        console.log('[FolderPicker] electronAPI not available, falling back to backend');
      }

      // Fallback to backend API
      console.log('[FolderPicker] Attempting backend API...');
      const response: any = await firstValueFrom(
        this.http.post('http://localhost:3001/api/pick-folder', {})
      );

      if (response && response.success && response.path) {
        console.log('[FolderPicker] Folder selected via backend:', response.path);
        return response.path;
      }
      
      if (response && response.cancelled) {
        console.log('[FolderPicker] User cancelled folder picker');
        return null;
      }

      console.log('[FolderPicker] All methods failed');
      return null;
    } catch (err) {
      console.error('[FolderPicker] Error:', err);
      return null;
    }
  }
}
