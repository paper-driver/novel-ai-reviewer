/**
 * Image Serving Routes
 * HTTP endpoints for serving images from the generated directory
 * Delegates image operations to ImageServingService
 */

const express = require('express');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'ImageServingRoutes';

function createImageServingRouter(imageServingService) {
  const router = express.Router();

  /**
   * GET /api/images/:folder/:file
   * Serve an image file with appropriate MIME type
   */
  router.get('/:folder/:file', (req, res) => {
    try {
      const { folder, file } = req.params;

      if (!folder || !file) {
        return res.status(400).json({ error: 'Folder and file required' });
      }

      // Security check
      if (folder.includes('..') || file.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const imagePath = path.join(process.cwd(), 'generated', folder, file);
      const imageBuffer = imageServingService.readImage(folder, file);
      const mimeType = imageServingService.getMimeType(file);

      logger.debug(TAG, `Serving image: ${folder}/${file}`);
      res.set('Content-Type', mimeType);
      res.send(imageBuffer);
    } catch (err) {
      if (err.message.includes('not found')) {
        logger.warn(TAG, `Image not found: ${req.params.file}`);
        return res.status(404).json({ error: 'Image not found' });
      }
      logger.error(TAG, `Failed to serve image: ${err.message}`);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  /**
   * GET /api/images/:folder
   * List all images in a folder
   */
  router.get('/:folder', (req, res) => {
    try {
      const { folder } = req.params;

      if (!folder) {
        return res.status(400).json({ error: 'Folder required' });
      }

      // Security check
      if (folder.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const folderPath = path.join(process.cwd(), 'generated', folder);
      const images = imageServingService.listImagesInFolder(folder);

      logger.info(TAG, `Listed ${images.length} images in folder: ${folder}`);
      res.json({ folder, count: images.length, images });
    } catch (err) {
      logger.error(TAG, `Failed to list images: ${err.message}`);
      res.status(500).json({ error: 'Failed to list images' });
    }
  });

  return router;
}

module.exports = createImageServingRouter;
