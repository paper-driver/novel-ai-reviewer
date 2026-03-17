/**
 * Folder Operations Service
 * Handles folder selection, opening, and directory operations
 * Cross-platform support (macOS, Windows, Linux)
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const logger = require('../utils/logger');

const TAG = 'FolderOperationsService';

class FolderOperationsService {
  /**
   * Open platform-specific folder picker dialog
   * Returns the selected path or null if cancelled
   */
  pickFolder() {
    const platform = os.platform();
    logger.debug(TAG, `Platform: ${platform}`);

    try {
      let selectedPath = '';

      if (platform === 'darwin') {
        selectedPath = this._pickFolderMac();
      } else if (platform === 'win32') {
        selectedPath = this._pickFolderWindows();
      } else if (platform === 'linux') {
        selectedPath = this._pickFolderLinux();
      } else {
        throw new Error('Unsupported platform for folder picker');
      }

      if (!selectedPath) {
        logger.info(TAG, `No path selected (empty output)`);
        return { success: false, cancelled: true, path: null };
      }

      // Decode the path if needed
      let decodedPath = selectedPath;
      try {
        decodedPath = decodeURIComponent(selectedPath);
      } catch (e) {
        // Use original if decoding fails
      }

      // Verify the path exists and is a directory
      if (!fs.existsSync(decodedPath)) {
        logger.error(TAG, `Path does not exist: ${decodedPath}`);
        return { success: false, error: 'Path does not exist', path: null };
      }

      const stats = fs.statSync(decodedPath);
      if (!stats.isDirectory()) {
        logger.error(TAG, `Path is not a directory: ${decodedPath}`);
        return { success: false, error: 'Not a directory', path: null };
      }

      logger.info(TAG, `Successfully selected folder: ${decodedPath}`);
      return { success: true, path: decodedPath };
    } catch (error) {
      logger.debug(TAG, `Execution error: ${error.message}`);
      // Check if user cancelled
      return { success: false, cancelled: true, path: null };
    }
  }

  /**
   * macOS folder picker using AppleScript
   */
  _pickFolderMac() {
    const script = `tell application "System Events"
  activate
  set folderPath to POSIX path of (choose folder with prompt "Select a folder:")
  return folderPath
end tell`;

    logger.debug(TAG, `Using macOS AppleScript`);
    return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  }

  /**
   * Windows folder picker using PowerShell
   */
  _pickFolderWindows() {
    const psCommand = `Add-Type -AssemblyName System.Windows.Forms;` +
      `$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;` +
      `$dialog.Description = 'Select a folder';` +
      `if ($dialog.ShowDialog() -eq 'OK') { Write-Host $dialog.SelectedPath }`;

    logger.debug(TAG, `Using Windows PowerShell`);
    return execSync(`powershell -NoProfile -Command "${psCommand}"`, {
      encoding: 'utf8',
      timeout: 60000,
      shell: 'powershell'
    }).trim();
  }

  /**
   * Linux folder picker using zenity or kdialog
   */
  _pickFolderLinux() {
    logger.debug(TAG, `Using Linux zenity/kdialog`);
    try {
      return execSync(`zenity --file-selection --directory --title "Select a folder"`, {
        encoding: 'utf8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch (e) {
      try {
        return execSync(`kdialog --getexistingdirectory . --title "Select a folder"`, {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
      } catch (e2) {
        logger.warn(TAG, `Neither zenity nor kdialog available`);
        throw new Error('No folder picker available on this Linux system');
      }
    }
  }

  /**
   * Open a folder in the system file explorer
   * Cross-platform (Finder on macOS, Explorer on Windows, etc.)
   */
  openFolder(folderPath) {
    // Verify path exists and is a directory
    if (!fs.existsSync(folderPath)) {
      logger.error(TAG, `Path does not exist: ${folderPath}`);
      throw new Error('Folder does not exist');
    }

    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      logger.error(TAG, `Path is not a directory: ${folderPath}`);
      throw new Error('Path is not a directory');
    }

    const platform = os.platform();
    logger.debug(TAG, `Opening folder: ${folderPath} on platform: ${platform}`);

    try {
      if (platform === 'darwin') {
        // macOS - use open command
        execSync(`open "${folderPath}"`, { stdio: 'ignore' });
      } else if (platform === 'win32') {
        // Windows - use explorer
        execSync(`explorer "${folderPath}"`, { stdio: 'ignore', shell: 'cmd.exe' });
      } else if (platform === 'linux') {
        // Linux - try various file managers
        this._openFolderLinux(folderPath);
      }

      logger.info(TAG, `Successfully opened folder: ${folderPath}`);
      return true;
    } catch (err) {
      logger.error(TAG, `Failed to open folder: ${err.message}`);
      throw err;
    }
  }

  /**
   * Linux folder opening - try multiple file managers
   */
  _openFolderLinux(folderPath) {
    try {
      execSync(`xdg-open "${folderPath}"`, { stdio: 'ignore' });
    } catch (e) {
      try {
        execSync(`nautilus "${folderPath}"`, { stdio: 'ignore' });
      } catch (e2) {
        try {
          execSync(`dolphin "${folderPath}"`, { stdio: 'ignore' });
        } catch (e3) {
          logger.warn(TAG, `Could not open folder with any file manager`);
          throw new Error('No file manager available');
        }
      }
    }
  }

  /**
   * Scan directory for PNG files recursively
   */
  scanPNGFilesRecursive(dirPath) {
    const pngFiles = [];

    try {
      if (!fs.existsSync(dirPath)) {
        logger.warn(TAG, `Directory not found: ${dirPath}`);
        return pngFiles;
      }

      const scan = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);

          if (stats.isDirectory()) {
            scan(filePath); // Recursive call
          } else if (file.endsWith('.png')) {
            pngFiles.push(filePath);
          }
        }
      };

      scan(dirPath);
      logger.debug(TAG, `Found ${pngFiles.length} PNG files in ${dirPath}`);
      return pngFiles;
    } catch (err) {
      logger.error(TAG, `Error scanning directory: ${err.message}`);
      return pngFiles;
    }
  }

  /**
   * List directories in a path
   */
  listDirectories(parentPath) {
    try {
      if (!fs.existsSync(parentPath)) {
        logger.warn(TAG, `Path not found: ${parentPath}`);
        return [];
      }

      const entries = fs.readdirSync(parentPath);
      const directories = entries.filter(entry => {
        const fullPath = path.join(parentPath, entry);
        const stats = fs.statSync(fullPath);
        return stats.isDirectory() && !entry.startsWith('.');
      });

      logger.debug(TAG, `Found ${directories.length} directories in ${parentPath}`);
      return directories;
    } catch (err) {
      logger.error(TAG, `Error listing directories: ${err.message}`);
      return [];
    }
  }

  /**
   * List files in a directory
   */
  listFiles(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        logger.warn(TAG, `Directory not found: ${dirPath}`);
        return [];
      }

      const files = fs.readdirSync(dirPath).filter(f => {
        const fullPath = path.join(dirPath, f);
        return fs.statSync(fullPath).isFile();
      });

      logger.debug(TAG, `Found ${files.length} files in ${dirPath}`);
      return files;
    } catch (err) {
      logger.error(TAG, `Error listing files: ${err.message}`);
      return [];
    }
  }
}

module.exports = FolderOperationsService;
