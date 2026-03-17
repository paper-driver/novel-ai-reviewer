/**
 * Ratings Routes
 * Endpoints for loading and saving image ratings
 * Used by Artist Gallery and Prompt Grouping pages
 */

const logger = require('../utils/logger');

/**
 * Create ratings routes
 * @param {RatingsService} ratingsService - The ratings service instance
 * @returns {Object} Express router with ratings endpoints
 */
function createRatingsRoutes(ratingsService) {
  const express = require('express');
  const router = express.Router();

  /**
   * GET /api/ratings/load
   * Load image ratings from unified ratings file
   * Query: folderPath (required)
   */
  router.get('/load', (req, res) => {
    try {
      const folderPath = req.query.folderPath;
      if (!folderPath) {
        return res.status(400).json({ error: 'Missing folderPath query parameter' });
      }

      const ratings = ratingsService.loadRatings(folderPath);
      res.json({ success: true, ratings });
    } catch (err) {
      logger.error('RatingsRoutes', `GET /load failed: ${err.message}`);
      
      if (err.message === 'Folder not found') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      res.status(500).json({ error: 'Failed to load ratings', details: err.message });
    }
  });

  /**
   * POST /api/ratings/save
   * Save image ratings to unified ratings file
   * Merges with existing ratings (does not overwrite)
   * Body: { folderPath, ratings }
   */
  router.post('/save', (req, res) => {
    try {
      const { folderPath, ratings } = req.body;
      if (!folderPath || !ratings) {
        return res.status(400).json({ error: 'Missing folderPath or ratings in request body' });
      }

      const result = ratingsService.saveRatings(folderPath, ratings);
      res.json({
        success: true,
        message: 'Ratings saved',
        totalEntries: result.totalEntries,
        newEntries: result.newEntries
      });
    } catch (err) {
      logger.error('RatingsRoutes', `POST /save failed: ${err.message}`);
      
      if (err.message === 'Folder not found') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      res.status(500).json({ error: 'Failed to save ratings', details: err.message });
    }
  });

  return router;
}

module.exports = createRatingsRoutes;
