/**
 * Image Metadata Routes
 * HTTP endpoints for extracting and retrieving image metadata
 * Delegates business logic to ImageMetadataService
 */

const express = require('express');
const logger = require('../utils/logger');

const TAG = 'ImageMetadataRoutes';

function createImageMetadataRouter(imageMetadataService) {
  const router = express.Router();

  /**
   * GET /api/image-metadata/:folder/:filename
   * Extract metadata from an image file
   * Returns: { filename, prompt, generationData }
   */
  router.get('/:folder/:filename', (req, res) => {
    try {
      const { folder, filename } = req.params;

      if (!folder || !filename) {
        return res.status(400).json({ error: 'Folder and filename required' });
      }

      // Security check: prevent invalid characters
      if (folder.includes('..') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const imagePath = require('path').join(process.cwd(), 'generated', folder, filename);
      const metadata = imageMetadataService.extractMetadata(imagePath);

      if (!metadata) {
        return res.status(404).json({ error: 'Image not found' });
      }

      logger.info(TAG, `Extracted metadata for: ${filename}`);
      res.json(metadata);
    } catch (err) {
      logger.error(TAG, `Failed to extract metadata: ${err.message}`);
      res.status(500).json({ error: 'Failed to extract metadata', details: err.message });
    }
  });

  return router;
}

module.exports = createImageMetadataRouter;
