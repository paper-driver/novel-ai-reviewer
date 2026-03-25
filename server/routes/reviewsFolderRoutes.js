/**
 * Reviews Folder Routes
 * API endpoints for managing reviews stored in source folders
 * Handles: load, create, update, delete reviews from source folder's .reviews.json
 */

const express = require('express');
const logger = require('../utils/logger');

const TAG = 'ReviewsFolderRoutes';

function createReviewsFolderRouter(reviewsFolderService) {
  const router = express.Router();

  /**
   * GET /api/reviews-folder/list
   * Load all reviews from a source folder
   * Query: sourcePath
   */
  router.get('/list', (req, res) => {
    try {
      const { sourcePath } = req.query;
      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const reviews = reviewsFolderService.getAllReviews(sourcePath);
      res.json({
        success: true,
        sourcePath,
        reviews,
        count: reviews.length
      });
    } catch (err) {
      logger.error(TAG, `Error listing reviews: ${err.message}`);
      res.status(500).json({ error: 'Failed to list reviews', details: err.message });
    }
  });

  /**
   * POST /api/reviews-folder/create
   * Create a new review
   * Body: { sourcePath, source, foreign_id, rating: {anatomy, face, object, background, character}, notes }
   */
  router.post('/create', (req, res) => {
    try {
      const { sourcePath, source, foreign_id, rating, notes } = req.body;

      if (!sourcePath || !source || !foreign_id) {
        return res.status(400).json({ 
          error: 'sourcePath, source, and foreign_id are required' 
        });
      }

      const newReview = reviewsFolderService.createReview(sourcePath, {
        source,
        foreign_id,
        rating,
        notes
      });

      res.json({
        success: true,
        review: newReview
      });
    } catch (err) {
      logger.error(TAG, `Error creating review: ${err.message}`);
      res.status(500).json({ error: 'Failed to create review', details: err.message });
    }
  });

  /**
   * PUT /api/reviews-folder/update/:reviewId
   * Update an existing review
   * Body: { sourcePath, rating?: {...}, notes?: "..." }
   */
  router.put('/update/:reviewId', (req, res) => {
    try {
      const { reviewId } = req.params;
      const { sourcePath, rating, notes } = req.body;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath is required' });
      }

      const updated = reviewsFolderService.updateReview(sourcePath, reviewId, {
        rating,
        notes
      });

      res.json({
        success: true,
        review: updated
      });
    } catch (err) {
      logger.error(TAG, `Error updating review: ${err.message}`);
      res.status(500).json({ error: 'Failed to update review', details: err.message });
    }
  });

  /**
   * DELETE /api/reviews-folder/delete/:reviewId
   * Delete a review
   * Query: sourcePath
   */
  router.delete('/delete/:reviewId', (req, res) => {
    try {
      const { reviewId } = req.params;
      const { sourcePath } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const deleted = reviewsFolderService.deleteReview(sourcePath, reviewId);

      res.json({
        success: true,
        deletedReview: deleted
      });
    } catch (err) {
      logger.error(TAG, `Error deleting review: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete review', details: err.message });
    }
  });

  /**
   * GET /api/reviews-folder/get-by-source :
   * Get review by source type and foreign_id
   * Query: sourcePath, source, foreign_id
   */
  router.get('/get-by-source', (req, res) => {
    try {
      const { sourcePath, source, foreign_id } = req.query;

      if (!sourcePath || !source || !foreign_id) {
        return res.status(400).json({ 
          error: 'sourcePath, source, and foreign_id are required' 
        });
      }

      const review = reviewsFolderService.getReviewBySourceAndId(sourcePath, source, foreign_id);

      res.json({
        success: true,
        review: review
      });
    } catch (err) {
      logger.error(TAG, `Error getting review: ${err.message}`);
      res.status(500).json({ error: 'Failed to get review', details: err.message });
    }
  });

  /**
   * POST /api/reviews-folder/check-exists
   * Check if reviews.json exists in source folder
   * Body: { sourcePath }
   */
  router.post('/check-exists', (req, res) => {
    try {
      const { sourcePath } = req.body;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath is required' });
      }

      const exists = reviewsFolderService.hasReviewFile(sourcePath);

      res.json({
        success: true,
        sourcePath,
        hasReviewFile: exists
      });
    } catch (err) {
      logger.error(TAG, `Error checking review file: ${err.message}`);
      res.status(500).json({ error: 'Failed to check review file', details: err.message });
    }
  });

  return router;
}

module.exports = createReviewsFolderRouter;
