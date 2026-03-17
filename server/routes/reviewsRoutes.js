/**
 * Reviews Routes
 * HTTP endpoints for reviews management
 * Handles HTTP concerns: request validation, response formatting
 * Delegates business logic to ReviewsService
 */

const express = require('express');
const logger = require('../utils/logger');

const TAG = 'ReviewsRoutes';

function createReviewsRouter(reviewsService, upload) {
  const router = express.Router();

  /**
   * GET /api/reviews
   * Get all reviews with optional filtering
   * Supports filtering via query params: prompt, handFeet, facialExpression, genital, accessories, sideCharacter, background
   */
  router.get('/', (req, res) => {
    try {
      let reviews = reviewsService.getAllReviews();
      const { prompt, handFeet, facialExpression, genital, accessories, sideCharacter, background } = req.query;
      
      // Filter by prompt text
      if (prompt) {
        const lower = String(prompt).toLowerCase();
        reviews = reviews.filter(r => r.prompt && r.prompt.toLowerCase().includes(lower));
      }
      
      // Filter by ratings
      const filters = { handFeet, facialExpression, genital, accessories, sideCharacter, background };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          reviews = reviews.filter(r => r.ratings && r.ratings[key] === value);
        }
      });
      
      logger.info(TAG, `Retrieved ${reviews.length} reviews`);
      res.json(reviews);
    } catch (err) {
      logger.error(TAG, `Failed to get reviews: ${err.message}`);
      res.status(500).json({ error: 'Failed to get reviews' });
    }
  });

  /**
   * GET /api/reviews/:id/images
   * Get images for a specific review
   */
  router.get('/:id/images', (req, res) => {
    try {
      const { id } = req.params;
      const review = reviewsService.getReviewById(id);
      
      if (!review) {
        logger.warn(TAG, `Review not found: ${id}`);
        return res.status(404).json({ error: 'Review not found' });
      }

      logger.info(TAG, `Retrieved images for review: ${id}`);
      res.json(review.images || []);
    } catch (err) {
      logger.error(TAG, `Failed to get review images: ${err.message}`);
      res.status(500).json({ error: 'Failed to get images' });
    }
  });

  /**
   * POST /api/reviews
   * Create a new review with images
   * Accepts multipart/form-data: prompt, review, ratings (JSON string), images (files)
   */
  router.post('/', upload.array('images'), (req, res) => {
    try {
      const { prompt, review, ratings } = req.body;
      
      if (!prompt || !ratings || !req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or images' });
      }

      const parsedRatings = JSON.parse(ratings);
      const reviews = reviewsService.getAllReviews();
      const id = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
      const folderName = req.generatedFolder || String(id);
      const images = req.files.map(f => f.filename);
      const thumbnail = images[0];

      const newReview = {
        id,
        prompt,
        review,
        ratings: parsedRatings,
        folder: folderName,
        images,
        thumbnail
      };

      reviews.push(newReview);
      reviewsService.writeReviews(reviews);

      logger.info(TAG, `Created new review: ${id}`);
      res.json(newReview);
    } catch (err) {
      logger.error(TAG, `Error saving review: ${err.message}`);
      res.status(500).json({ error: 'Failed to save review' });
    }
  });

  /**
   * PUT /api/reviews/:id
   * Update an existing review
   */
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const review = reviewsService.getReviewById(id);
      if (!review) {
        logger.warn(TAG, `Review not found for update: ${id}`);
        return res.status(404).json({ error: 'Review not found' });
      }

      const updated = reviewsService.updateReview(id, updates);
      logger.info(TAG, `Updated review: ${id}`);
      res.json(updated);
    } catch (err) {
      logger.error(TAG, `Failed to update review: ${err.message}`);
      res.status(500).json({ error: 'Failed to update review' });
    }
  });

  /**
   * DELETE /api/reviews/:id
   * Delete a review
   */
  router.delete('/:id', (req, res) => {
    try {
      const { id } = req.params;

      const review = reviewsService.getReviewById(id);
      if (!review) {
        logger.warn(TAG, `Review not found for delete: ${id}`);
        return res.status(404).json({ error: 'Review not found' });
      }

      const deleted = reviewsService.deleteReview(id);
      if (deleted) {
        logger.info(TAG, `Deleted review: ${id}`);
        res.json({ success: true, id });
      } else {
        res.status(500).json({ error: 'Failed to delete review' });
      }
    } catch (err) {
      logger.error(TAG, `Failed to delete review: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete review' });
    }
  });

  return router;
}

module.exports = createReviewsRouter;
