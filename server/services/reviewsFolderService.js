/**
 * Reviews Folder Service
 * Manages reviews stored in source folders (artist_gallery or prompt_grouping)
 * Each source folder has a .reviews.json file containing reviews linked to that folder's content
 * 
 * Review object structure:
 * {
 *   id: "uuid",
 *   source: "artist_gallery" | "prompt_grouping",
 *   foreign_id: "folder_name" | "group_id",
 *   rating: { anatomy, face, object, background, character },
 *   notes: "optional notes",
 *   timestamp: "iso-date"
 * }
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const TAG = 'ReviewsFolderService';
const REVIEWS_FILENAME = '.reviews.json';

class ReviewsFolderService {
  /**
   * Get full path to reviews.json in a source folder
   */
  getReviewsFilePath(sourceFolderPath) {
    return path.join(sourceFolderPath, REVIEWS_FILENAME);
  }

  /**
   * Load all reviews from a source folder
   */
  loadReviews(sourceFolderPath) {
    try {
      if (!sourceFolderPath) {
        logger.warn(TAG, 'Source folder path is empty');
        return [];
      }

      if (!fs.existsSync(sourceFolderPath)) {
        logger.warn(TAG, `Source folder not found: ${sourceFolderPath}`);
        return [];
      }

      const reviewsPath = this.getReviewsFilePath(sourceFolderPath);
      if (!fs.existsSync(reviewsPath)) {
        logger.debug(TAG, `No reviews file found in ${sourceFolderPath}`);
        return [];
      }

      const content = fs.readFileSync(reviewsPath, 'utf8');
      const reviews = JSON.parse(content || '[]');
      logger.debug(TAG, `Loaded ${reviews.length} reviews from ${sourceFolderPath}`);
      return reviews;
    } catch (err) {
      logger.error(TAG, `Error loading reviews: ${err.message}`);
      return [];
    }
  }

  /**
   * Save reviews to a source folder
   */
  saveReviews(sourceFolderPath, reviews) {
    try {
      if (!sourceFolderPath || !fs.existsSync(sourceFolderPath)) {
        throw new Error(`Invalid source folder: ${sourceFolderPath}`);
      }

      const reviewsPath = this.getReviewsFilePath(sourceFolderPath);
      fs.writeFileSync(reviewsPath, JSON.stringify(reviews, null, 2));
      logger.info(TAG, `Saved ${reviews.length} reviews to ${sourceFolderPath}`);
    } catch (err) {
      logger.error(TAG, `Error saving reviews: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get review by ID
   */
  getReviewById(sourceFolderPath, reviewId) {
    const reviews = this.loadReviews(sourceFolderPath);
    return reviews.find(r => r.id === reviewId) || null;
  }

  /**
   * Get review by source type and foreign_id (for checking if review already exists)
   */
  getReviewBySourceAndId(sourceFolderPath, source, foreignId) {
    const reviews = this.loadReviews(sourceFolderPath);
    return reviews.find(r => r.source === source && r.foreign_id === foreignId) || null;
  }

  /**
   * Create new review
   */
  createReview(sourceFolderPath, reviewData) {
    const reviews = this.loadReviews(sourceFolderPath);

    const newReview = {
      id: uuidv4(),
      source: reviewData.source,
      foreign_id: reviewData.foreign_id,
      rating: {
        anatomy: reviewData.rating?.anatomy || null,
        face: reviewData.rating?.face || null,
        object: reviewData.rating?.object || null,
        background: reviewData.rating?.background || null,
        character: reviewData.rating?.character || null
      },
      notes: reviewData.notes || '',
      timestamp: new Date().toISOString()
    };

    reviews.push(newReview);
    this.saveReviews(sourceFolderPath, reviews);

    logger.info(TAG, `Created review ${newReview.id} for ${newReview.source}:${newReview.foreign_id}`);
    return newReview;
  }

  /**
   * Update existing review
   */
  updateReview(sourceFolderPath, reviewId, updates) {
    const reviews = this.loadReviews(sourceFolderPath);
    const index = reviews.findIndex(r => r.id === reviewId);

    if (index === -1) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const updated = {
      ...reviews[index],
      rating: {
        ...reviews[index].rating,
        ...(updates.rating || {})
      },
      notes: updates.notes !== undefined ? updates.notes : reviews[index].notes,
      updatedAt: new Date().toISOString()
    };

    reviews[index] = updated;
    this.saveReviews(sourceFolderPath, reviews);

    logger.info(TAG, `Updated review ${reviewId}`);
    return updated;
  }

  /**
   * Delete review
   */
  deleteReview(sourceFolderPath, reviewId) {
    const reviews = this.loadReviews(sourceFolderPath);
    const index = reviews.findIndex(r => r.id === reviewId);

    if (index === -1) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const deleted = reviews[index];
    reviews.splice(index, 1);
    this.saveReviews(sourceFolderPath, reviews);

    logger.info(TAG, `Deleted review ${reviewId}`);
    return deleted;
  }

  /**
   * Get all reviews from a source folder
   */
  getAllReviews(sourceFolderPath) {
    return this.loadReviews(sourceFolderPath);
  }

  /**
   * Check if review file exists
   */
  hasReviewFile(sourceFolderPath) {
    const reviewsPath = this.getReviewsFilePath(sourceFolderPath);
    return fs.existsSync(reviewsPath);
  }
}

module.exports = ReviewsFolderService;
