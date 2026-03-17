/**
 * File System Service
 * Handles file system operations: reading, writing, directory management
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'FileSystemService';

class FileSystemService {
  /**
   * Ensure directory exists
   */
  ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.debug(TAG, `Created directory: ${dirPath}`);
      }
    } catch (err) {
      logger.error(TAG, `Failed to create directory ${dirPath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Check if file exists
   */
  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * Check if directory exists
   */
  directoryExists(dirPath) {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  }

  /**
   * Read JSON file
   */
  readJsonFile(filePath) {
    try {
      if (!this.fileExists(filePath)) {
        logger.warn(TAG, `File not found: ${filePath}`);
        return null;
      }
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      logger.error(TAG, `Failed to read JSON file ${filePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Write JSON file
   */
  writeJsonFile(filePath, data) {
    try {
      const dir = path.dirname(filePath);
      this.ensureDirectoryExists(dir);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger.debug(TAG, `Wrote JSON file: ${filePath}`);
    } catch (err) {
      logger.error(TAG, `Failed to write JSON file ${filePath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Read file as string
   */
  readFileAsString(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      logger.error(TAG, `Failed to read file ${filePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Write file as string
   */
  writeFileAsString(filePath, content) {
    try {
      const dir = path.dirname(filePath);
      this.ensureDirectoryExists(dir);
      fs.writeFileSync(filePath, content);
      logger.debug(TAG, `Wrote file: ${filePath}`);
    } catch (err) {
      logger.error(TAG, `Failed to write file ${filePath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * List files in directory
   */
  listFilesInDirectory(dirPath, extension = null) {
    try {
      if (!this.directoryExists(dirPath)) {
        logger.warn(TAG, `Directory not found: ${dirPath}`);
        return [];
      }
      let files = fs.readdirSync(dirPath);
      if (extension) {
        files = files.filter(f => f.endsWith(extension));
      }
      return files;
    } catch (err) {
      logger.error(TAG, `Failed to list files in ${dirPath}: ${err.message}`);
      return [];
    }
  }

  /**
   * Delete file
   */
  deleteFile(filePath) {
    try {
      if (this.fileExists(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(TAG, `Deleted file: ${filePath}`);
      }
    } catch (err) {
      logger.error(TAG, `Failed to delete file ${filePath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Delete directory recursively
   */
  deleteDirectory(dirPath) {
    try {
      if (this.directoryExists(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        logger.debug(TAG, `Deleted directory: ${dirPath}`);
      }
    } catch (err) {
      logger.error(TAG, `Failed to delete directory ${dirPath}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Copy file
   */
  copyFile(sourcePath, destinationPath) {
    try {
      const dir = path.dirname(destinationPath);
      this.ensureDirectoryExists(dir);
      fs.copyFileSync(sourcePath, destinationPath);
      logger.debug(TAG, `Copied file from ${sourcePath} to ${destinationPath}`);
    } catch (err) {
      logger.error(TAG, `Failed to copy file: ${err.message}`);
      throw err;
    }
  }
}

module.exports = FileSystemService;
