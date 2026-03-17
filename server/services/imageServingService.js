/**
 * Image Serving Service
 * Handles serving and retrieving images from the file system
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'ImageServingService';

class ImageServingService {
  constructor(generatedDir) {
    this.generatedDir = generatedDir;
  }

  /**
   * Get image file path safely (with directory traversal protection)
   */
  getImagePath(folder, filename) {
    const imagePath = path.join(this.generatedDir, folder, filename);

    // Security check: prevent directory traversal attacks
    if (!imagePath.startsWith(this.generatedDir)) {
      logger.warn(TAG, `Directory traversal attempt: ${imagePath}`);
      throw new Error('Invalid path');
    }

    if (!fs.existsSync(imagePath)) {
      logger.warn(TAG, `Image not found: ${imagePath}`);
      throw new Error('Image not found');
    }

    return imagePath;
  }

  /**
   * Read image file
   */
  readImage(folder, filename) {
    try {
      const imagePath = this.getImagePath(folder, filename);
      const imageBuffer = fs.readFileSync(imagePath);
      logger.debug(TAG, `Read image: ${folder}/${filename} (${imageBuffer.length} bytes)`);
      return imageBuffer;
    } catch (err) {
      logger.error(TAG, `Failed to read image: ${err.message}`);
      throw err;
    }
  }

  /**
   * List all images in a folder
   */
  listImagesInFolder(folder) {
    try {
      const folderPath = path.join(this.generatedDir, folder);

      // Security check
      if (!folderPath.startsWith(this.generatedDir)) {
        logger.warn(TAG, `Directory traversal attempt: ${folderPath}`);
        throw new Error('Invalid path');
      }

      if (!fs.existsSync(folderPath)) {
        logger.warn(TAG, `Folder not found: ${folderPath}`);
        return [];
      }

      const files = fs.readdirSync(folderPath);
      const images = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
      });

      logger.debug(TAG, `Found ${images.length} images in ${folder}`);
      return images;
    } catch (err) {
      logger.error(TAG, `Failed to list images: ${err.message}`);
      throw err;
    }
  }

  /**
   * Check if image exists
   */
  imageExists(folder, filename) {
    try {
      const imagePath = this.getImagePath(folder, filename);
      return fs.existsSync(imagePath);
    } catch (err) {
      return false;
    }
  }

  /**
   * Get image file size
   */
  getImageSize(folder, filename) {
    try {
      const imagePath = this.getImagePath(folder, filename);
      const stats = fs.statSync(imagePath);
      return stats.size;
    } catch (err) {
      logger.error(TAG, `Failed to get image size: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get image MIME type from extension
   */
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Delete image
   */
  deleteImage(folder, filename) {
    try {
      const imagePath = this.getImagePath(folder, filename);
      fs.unlinkSync(imagePath);
      logger.info(TAG, `Deleted image: ${folder}/${filename}`);
      return true;
    } catch (err) {
      logger.error(TAG, `Failed to delete image: ${err.message}`);
      throw err;
    }
  }
}

module.exports = ImageServingService;
