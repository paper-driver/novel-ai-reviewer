/**
 * Base Image Manager Service
 * Handles base image uploads, listing, and deletion
 * Base images are stored in a genericBaseImages/ folder and can be reused across multiple artists
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'BaseImageManagerService';
const GENERIC_BASE_IMAGES_FOLDER = 'genericBaseImages';

class BaseImageManagerService {
  constructor(logger, fileSystemService) {
    this.logger = logger;
    this.fileSystemService = fileSystemService;
  }

  /**
   * Ensure genericBaseImages folder exists in the registry folder
   * @param {string} registryFolder - Root registry folder path
   * @returns {string} - Path to genericBaseImages folder
   */
  ensureGenericBaseImagesFolder(registryFolder) {
    try {
      const genericBaseImagePath = path.join(registryFolder, GENERIC_BASE_IMAGES_FOLDER);

      if (!fs.existsSync(genericBaseImagePath)) {
        fs.mkdirSync(genericBaseImagePath, { recursive: true });
        this.logger.info(TAG, `Created genericBaseImages folder: ${genericBaseImagePath}`);
      }

      return genericBaseImagePath;
    } catch (error) {
      this.logger.error(TAG, `Error ensuring genericBaseImages folder: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload a base image to the genericBaseImages folder
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} filename - Original filename
   * @param {string} registryFolder - Root registry folder path
   * @returns {Promise<{success, path, message}>}
   */
  async uploadBaseImage(imageBuffer, filename, registryFolder) {
    try {
      // Validate filename
      if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename');
      }

      // Security check - prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename - path traversal not allowed');
      }

      // Validate it's an image file
      if (!filename.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/i)) {
        throw new Error('Only PNG, JPG, and WebP files are supported');
      }

      // Ensure folder exists
      const genericBasePath = this.ensureGenericBaseImagesFolder(registryFolder);

      // Check if file already exists
      const filePath = path.join(genericBasePath, filename);
      if (fs.existsSync(filePath)) {
        throw new Error(`File already exists: ${filename}`);
      }

      // Write file
      fs.writeFileSync(filePath, imageBuffer);
      this.logger.info(TAG, `Uploaded base image: ${filePath} (${imageBuffer.length} bytes)`);

      return {
        success: true,
        path: filePath,
        filename: filename,
        size: imageBuffer.length,
        message: 'Base image uploaded successfully'
      };
    } catch (error) {
      this.logger.error(TAG, `Error uploading base image: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all base images available in the registry
   * @param {string} registryFolder - Root registry folder path
   * @param {Object} imageMetadataService - Service to extract metadata
   * @returns {Promise<Array>} - Array of base image info
   */
  async listBaseImages(registryFolder, imageMetadataService) {
    try {
      const genericBasePath = this.ensureGenericBaseImagesFolder(registryFolder);

      this.logger.info(TAG, `Listing base images from: ${genericBasePath}`);

      if (!fs.existsSync(genericBasePath)) {
        this.logger.warn(TAG, `genericBaseImages folder does not exist: ${genericBasePath}`);
        return [];
      }

      const files = fs.readdirSync(genericBasePath);
      const imageFiles = files.filter(f => 
        f.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/i)
      );

      this.logger.info(TAG, `Found ${imageFiles.length} image files: ${JSON.stringify(imageFiles.slice(0, 10))}`);

      const images = imageFiles.map(filename => {
        const filePath = path.join(genericBasePath, filename);
        const stats = fs.statSync(filePath);

        // Try to extract metadata
        let metadata = null;
        try {
          if (imageMetadataService) {
            metadata = imageMetadataService.extractMetadata(filePath);
          }
        } catch (e) {
          this.logger.warn(TAG, `Could not extract metadata for ${filename}`);
        }

        return {
          name: filename,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          metadata: metadata
        };
      });

      this.logger.info(TAG, `Returning ${images.length} base images`);
      return images;
    } catch (error) {
      this.logger.error(TAG, `Error listing base images: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a base image from the genericBaseImages folder
   * @param {string} filename - Image filename to delete
   * @param {string} registryFolder - Root registry folder path
   * @returns {Promise<{success, message}>}
   */
  async deleteBaseImage(filename, registryFolder) {
    try {
      // Security check
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename - path traversal not allowed');
      }

      const genericBasePath = this.ensureGenericBaseImagesFolder(registryFolder);
      const filePath = path.join(genericBasePath, filename);

      // Verify file exists and is in the genericBaseImages folder
      if (!fs.existsSync(filePath)) {
        throw new Error(`Base image not found: ${filename}`);
      }

      // Additional security - verify file is actually in genericBaseImages folder
      const resolvedPath = fs.realpathSync(filePath);
      const resolvedBasePath = fs.realpathSync(genericBasePath);
      if (!resolvedPath.startsWith(resolvedBasePath)) {
        throw new Error('Invalid file path - security check failed');
      }

      // Delete the file
      fs.unlinkSync(filePath);
      this.logger.info(TAG, `Deleted base image: ${filename}`);

      return {
        success: true,
        message: `Base image deleted: ${filename}`
      };
    } catch (error) {
      this.logger.error(TAG, `Error deleting base image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get path to a specific base image
   * @param {string} filename - Image filename
   * @param {string} registryFolder - Root registry folder path
   * @returns {string} - Full path to image
   */
  getBaseImagePath(filename, registryFolder) {
    try {
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename');
      }

      const genericBasePath = this.ensureGenericBaseImagesFolder(registryFolder);
      const filePath = path.join(genericBasePath, filename);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Base image not found: ${filename}`);
      }

      return filePath;
    } catch (error) {
      this.logger.error(TAG, `Error getting base image path: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate base image format
   * @param {string} imagePath - Path to image file
   * @returns {boolean} - True if valid
   */
  isValidBaseImage(imagePath) {
    try {
      if (!fs.existsSync(imagePath)) {
        return false;
      }

      // Check file extension
      const ext = path.extname(imagePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        return false;
      }

      // Check file size (max 50MB)
      const stats = fs.statSync(imagePath);
      if (stats.size > 50 * 1024 * 1024) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(TAG, `Error validating image: ${error.message}`);
      return false;
    }
  }
}

module.exports = BaseImageManagerService;
