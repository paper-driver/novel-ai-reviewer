/**
 * Base Image Manager Routes
 * HTTP endpoints for uploading, listing, and deleting base images
 * Delegates business logic to BaseImageManagerService
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'BaseImageRoutes';

function createBaseImageRoutes(baseImageManagerService, imageMetadataService) {
  const router = express.Router();

  /**
   * POST /api/base-images/upload
   * Upload a new base image to genericBaseImages folder
   * Body: { imageBase64: string, filename: string, registryFolder: string }
   * Response: { success, path, message }
   */
  router.post('/upload', async (req, res) => {
    try {
      const { imageBase64, filename, registryFolder } = req.body;

      if (!imageBase64 || !filename || !registryFolder) {
        return res.status(400).json({
          error: 'imageBase64, filename, and registryFolder are required'
        });
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      // Upload the image
      const result = await baseImageManagerService.uploadBaseImage(
        imageBuffer,
        filename,
        registryFolder
      );

      logger.info(TAG, `Uploaded base image: ${filename}`);
      res.json(result);
    } catch (err) {
      logger.error(TAG, `Failed to upload base image: ${err.message}`);
      res.status(400).json({
        error: 'Failed to upload base image',
        details: err.message
      });
    }
  });

  /**
   * GET /api/base-images/list
   * List all available base images in a folder
   * Query: ?registryFolder=path
   * Response: { success, images: [...] }
   */
  router.get('/list', async (req, res) => {
    try {
      const { registryFolder } = req.query;

      if (!registryFolder) {
        return res.status(400).json({
          error: 'registryFolder query parameter is required'
        });
      }

      const images = await baseImageManagerService.listBaseImages(
        registryFolder,
        imageMetadataService
      );

      logger.info(TAG, `Listed ${images.length} base images`);
      res.json({
        success: true,
        images: images
      });
    } catch (err) {
      logger.error(TAG, `Failed to list base images: ${err.message}`);
      res.status(500).json({
        error: 'Failed to list base images',
        details: err.message
      });
    }
  });

  /**
   * DELETE /api/base-images/:filename
   * Delete a base image from the genericBaseImages folder
   * Query: ?registryFolder=path
   * Response: { success, message }
   */
  router.delete('/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const { registryFolder } = req.query;

      if (!registryFolder) {
        return res.status(400).json({
          error: 'registryFolder query parameter is required'
        });
      }

      if (!filename) {
        return res.status(400).json({
          error: 'filename parameter is required'
        });
      }

      const result = await baseImageManagerService.deleteBaseImage(
        filename,
        registryFolder
      );

      logger.info(TAG, `Deleted base image: ${filename}`);
      res.json(result);
    } catch (err) {
      logger.error(TAG, `Failed to delete base image: ${err.message}`);
      res.status(400).json({
        error: 'Failed to delete base image',
        details: err.message
      });
    }
  });

  /**
   * GET /api/file-proxy
   * Serve an image file from disk
   * Query: ?path=/full/path/to/file
   * Response: Image file with proper content-type
   */
  router.get('/file-proxy', (req, res) => {
    try {
      const { path: filePath } = req.query;

      if (!filePath) {
        return res.status(400).json({
          error: 'path query parameter is required'
        });
      }

      // Security: prevent directory traversal
      const resolvedPath = path.resolve(filePath);
      const requestedDir = path.dirname(resolvedPath);
      
      // Only allow serving files from the project's Pictures directory or user's home
      const homeDir = require('os').homedir();
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({
          error: 'Access denied: path outside allowed directories'
        });
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(TAG, `File not found: ${resolvedPath}`);
        return res.status(404).json({
          error: 'File not found',
          path: filePath
        });
      }

      // Check if it's a file (not directory)
      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        return res.status(400).json({
          error: 'Path is not a file'
        });
      }

      // Determine content type
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentTypeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };

      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Set headers and send file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      const fileStream = fs.createReadStream(resolvedPath);
      fileStream.pipe(res);

      fileStream.on('error', (err) => {
        logger.error(TAG, `Error streaming file: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Error reading file'
          });
        }
      });
    } catch (err) {
      logger.error(TAG, `File proxy error: ${err.message}`);
      res.status(500).json({
        error: 'Internal server error',
        details: err.message
      });
    }
  });

  return router;
}

module.exports = createBaseImageRoutes;
