/**
 * Tags Routes
 * API endpoints for managing tags in source folders
 * Handles: create, read, update, delete tags from source folder's .tags.json
 * Also handles assigning/removing tags from reviews
 */

const express = require('express');
const logger = require('../utils/logger');

const TAG = 'TagsRoutes';

function createTagsRouter(tagsService, reviewsFolderService) {
  const router = express.Router();

  /**
   * GET /api/tags/list
   * Get all tags from a source folder
   * Query: sourcePath
   */
  router.get('/list', (req, res) => {
    try {
      const { sourcePath } = req.query;
      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const tags = tagsService.getAllTags(sourcePath);
      res.json({
        success: true,
        sourcePath,
        tags,
        count: tags.length
      });
    } catch (err) {
      logger.error(TAG, `Error listing tags: ${err.message}`);
      res.status(500).json({ error: 'Failed to list tags', details: err.message });
    }
  });

  /**
   * POST /api/tags/create
   * Create a new tag
   * Body: { sourcePath, name, color }
   */
  router.post('/create', (req, res) => {
    try {
      const { sourcePath, name, color } = req.body;

      if (!sourcePath || !name) {
        return res.status(400).json({ 
          error: 'sourcePath and name are required' 
        });
      }

      const newTag = tagsService.createTag(sourcePath, {
        name,
        color
      });

      res.json({
        success: true,
        tag: newTag
      });
    } catch (err) {
      logger.error(TAG, `Error creating tag: ${err.message}`);
      res.status(500).json({ error: 'Failed to create tag', details: err.message });
    }
  });

  /**
   * PUT /api/tags/update/:tagId
   * Update an existing tag
   * Body: { sourcePath, name?: "...", color?: "#HEX" }
   */
  router.put('/update/:tagId', (req, res) => {
    try {
      const { tagId } = req.params;
      const { sourcePath, name, color } = req.body;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath is required' });
      }

      const updated = tagsService.updateTag(sourcePath, tagId, {
        name,
        color
      });

      res.json({
        success: true,
        tag: updated
      });
    } catch (err) {
      logger.error(TAG, `Error updating tag: ${err.message}`);
      res.status(500).json({ error: 'Failed to update tag', details: err.message });
    }
  });

  /**
   * DELETE /api/tags/delete/:tagId
   * Delete a tag
   * Query: sourcePath
   */
  router.delete('/delete/:tagId', (req, res) => {
    try {
      const { tagId } = req.params;
      const { sourcePath } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const deleted = tagsService.deleteTag(sourcePath, tagId);

      res.json({
        success: true,
        tag: deleted
      });
    } catch (err) {
      logger.error(TAG, `Error deleting tag: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete tag', details: err.message });
    }
  });

  /**
   * POST /api/tags/reviews/:reviewId/add/:tagId
   * Add a tag to a review
   * Query: sourcePath
   */
  router.post('/reviews/:reviewId/add/:tagId', (req, res) => {
    try {
      const { reviewId, tagId } = req.params;
      const { sourcePath } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      // Verify tag exists
      const tag = tagsService.getTagById(sourcePath, tagId);
      if (!tag) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      const review = reviewsFolderService.addTagToReview(sourcePath, reviewId, tagId);

      res.json({
        success: true,
        review
      });
    } catch (err) {
      logger.error(TAG, `Error adding tag to review: ${err.message}`);
      res.status(500).json({ error: 'Failed to add tag to review', details: err.message });
    }
  });

  /**
   * DELETE /api/tags/reviews/:reviewId/remove/:tagId
   * Remove a tag from a review
   * Query: sourcePath
   */
  router.delete('/reviews/:reviewId/remove/:tagId', (req, res) => {
    try {
      const { reviewId, tagId } = req.params;
      const { sourcePath } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const review = reviewsFolderService.removeTagFromReview(sourcePath, reviewId, tagId);

      res.json({
        success: true,
        review
      });
    } catch (err) {
      logger.error(TAG, `Error removing tag from review: ${err.message}`);
      res.status(500).json({ error: 'Failed to remove tag from review', details: err.message });
    }
  });

  /**
   * GET /api/tags/reviews/filter
   * Filter reviews by tags
   * Query: sourcePath, tags (comma-separated tag IDs)
   */
  router.get('/reviews/filter', (req, res) => {
    try {
      const { sourcePath, tags } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ error: 'sourcePath query parameter required' });
      }

      const tagIds = tags ? tags.split(',').map(t => t.trim()) : [];
      const filteredReviews = reviewsFolderService.filterReviewsByTags(sourcePath, tagIds);

      res.json({
        success: true,
        sourcePath,
        tags: tagIds,
        reviews: filteredReviews,
        count: filteredReviews.length
      });
    } catch (err) {
      logger.error(TAG, `Error filtering reviews by tags: ${err.message}`);
      res.status(500).json({ error: 'Failed to filter reviews', details: err.message });
    }
  });

  /**
   * POST /api/tags/images/add-tag
   * Add a tag to an image
   * Body: { sourcePath, imageFilename, tagId }
   */
  router.post('/images/add-tag', (req, res) => {
    try {
      const { sourcePath, imageFilename, tagId } = req.body;

      if (!sourcePath || !imageFilename || !tagId) {
        return res.status(400).json({ 
          error: 'sourcePath, imageFilename, and tagId are required' 
        });
      }

      // Verify tag exists
      const tag = tagsService.getTagById(sourcePath, tagId);
      if (!tag) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      const imageTags = tagsService.addTagToImage(sourcePath, imageFilename, tagId);

      res.json({
        success: true,
        imageFilename,
        tags: imageTags
      });
    } catch (err) {
      logger.error(TAG, `Error adding tag to image: ${err.message}`);
      res.status(500).json({ error: 'Failed to add tag to image', details: err.message });
    }
  });

  /**
   * DELETE /api/tags/images/remove-tag
   * Remove a tag from an image
   * Body: { sourcePath, imageFilename, tagId }
   */
  router.delete('/images/remove-tag', (req, res) => {
    try {
      const { sourcePath, imageFilename, tagId } = req.body;

      if (!sourcePath || !imageFilename || !tagId) {
        return res.status(400).json({ 
          error: 'sourcePath, imageFilename, and tagId are required' 
        });
      }

      const imageTags = tagsService.removeTagFromImage(sourcePath, imageFilename, tagId);

      res.json({
        success: true,
        imageFilename,
        tags: imageTags
      });
    } catch (err) {
      logger.error(TAG, `Error removing tag from image: ${err.message}`);
      res.status(500).json({ error: 'Failed to remove tag from image', details: err.message });
    }
  });

  /**
   * GET /api/tags/images/get-tags
   * Get all tags for a specific image
   * Query: sourcePath, imageFilename
   */
  router.get('/images/get-tags', (req, res) => {
    try {
      const { sourcePath, imageFilename } = req.query;

      if (!sourcePath || !imageFilename) {
        return res.status(400).json({ 
          error: 'sourcePath and imageFilename query parameters required' 
        });
      }

      const tagIds = tagsService.getImageTags(sourcePath, imageFilename);
      const tagDetails = tagsService.getImageTagDetails(sourcePath, imageFilename);

      res.json({
        success: true,
        imageFilename,
        tagIds,
        tags: tagDetails
      });
    } catch (err) {
      logger.error(TAG, `Error getting image tags: ${err.message}`);
      res.status(500).json({ error: 'Failed to get image tags', details: err.message });
    }
  });

  /**
   * GET /api/tags/images/filter
   * Filter images by tags (AND logic)
   * Query: sourcePath, imageFilenames (comma-separated), tags (comma-separated tag IDs)
   */
  router.get('/images/filter', (req, res) => {
    try {
      const { sourcePath, imageFilenames, tags } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ 
          error: 'sourcePath query parameter required' 
        });
      }

      const images = imageFilenames ? imageFilenames.split(',').map(f => f.trim()) : [];
      const tagIds = tags ? tags.split(',').map(t => t.trim()) : [];

      const filteredImages = tagsService.filterImagesByTags(sourcePath, images, tagIds);

      res.json({
        success: true,
        sourcePath,
        tags: tagIds,
        imageFilenames: filteredImages,
        count: filteredImages.length
      });
    } catch (err) {
      logger.error(TAG, `Error filtering images by tags: ${err.message}`);
      res.status(500).json({ error: 'Failed to filter images', details: err.message });
    }
  });

  /**
   * GET /api/tags/images/union-tags
   * Get union of all tags across multiple images
   * Query: sourcePath, imageFilenames (comma-separated)
   */
  router.get('/images/union-tags', (req, res) => {
    try {
      const { sourcePath, imageFilenames } = req.query;

      if (!sourcePath) {
        return res.status(400).json({ 
          error: 'sourcePath query parameter required' 
        });
      }

      const images = imageFilenames ? imageFilenames.split('|').map(f => f.trim()) : [];
      const tagIds = tagsService.getUnionTagsForImages(sourcePath, images);
      const tagDetails = tagsService.getUnionTagDetailsForImages(sourcePath, images);

      res.json({
        success: true,
        imageFilenames: images,
        tagIds,
        tags: tagDetails,
        count: tagIds.length
      });
    } catch (err) {
      logger.error(TAG, `Error getting union tags: ${err.message}`);
      res.status(500).json({ error: 'Failed to get union tags', details: err.message });
    }
  });

  /**
   * POST /api/tags/images/add-to-multiple
   * Add a tag to multiple images
   * Body: { sourcePath, imageFilenames (array), tagId }
   */
  router.post('/images/add-to-multiple', (req, res) => {
    try {
      const { sourcePath, imageFilenames, tagId } = req.body;

      if (!sourcePath || !imageFilenames || !Array.isArray(imageFilenames) || !tagId) {
        return res.status(400).json({ 
          error: 'sourcePath (string), imageFilenames (array), and tagId (string) are required' 
        });
      }

      // Verify tag exists
      const tag = tagsService.getTagById(sourcePath, tagId);
      if (!tag) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      const count = tagsService.addTagToMultipleImages(sourcePath, imageFilenames, tagId);

      res.json({
        success: true,
        count,
        tagId,
        imageFilenames
      });
    } catch (err) {
      logger.error(TAG, `Error adding tag to multiple images: ${err.message}`);
      res.status(500).json({ error: 'Failed to add tag to multiple images', details: err.message });
    }
  });

  /**
   * DELETE /api/tags/images/remove-from-multiple
   * Remove a tag from multiple images
   * Body: { sourcePath, imageFilenames (array), tagId }
   */
  router.delete('/images/remove-from-multiple', (req, res) => {
    try {
      const { sourcePath, imageFilenames, tagId } = req.body;

      if (!sourcePath || !imageFilenames || !Array.isArray(imageFilenames) || !tagId) {
        return res.status(400).json({ 
          error: 'sourcePath (string), imageFilenames (array), and tagId (string) are required' 
        });
      }

      const count = tagsService.removeTagFromMultipleImages(sourcePath, imageFilenames, tagId);

      res.json({
        success: true,
        count,
        tagId,
        imageFilenames
      });
    } catch (err) {
      logger.error(TAG, `Error removing tag from multiple images: ${err.message}`);
      res.status(500).json({ error: 'Failed to remove tag from multiple images', details: err.message });
    }
  });

  return router;
}

module.exports = createTagsRouter;
