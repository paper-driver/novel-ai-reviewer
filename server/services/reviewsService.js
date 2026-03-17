/**
 * Reviews Service
 * Core business logic for managing reviews
 * Handles reading, writing, and validation of review data
 * No HTTP/Express code here - pure business logic
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'ReviewsService';

class ReviewsService {
  constructor(dataFilePath) {
    this.dataFile = dataFilePath;
    this.ensureDataFileExists();
  }

  /**
   * Ensure the data file exists
   */
  ensureDataFileExists() {
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, '[]');
      logger.info(TAG, `Created data file at ${this.dataFile}`);
    }
  }

  /**
   * Read all reviews from file
   */
  readReviews() {
    try {
      const data = fs.readFileSync(this.dataFile, 'utf8');
      return JSON.parse(data || '[]');
    } catch (err) {
      logger.error(TAG, `Failed to read reviews: ${err.message}`);
      return [];
    }
  }

  /**
   * Write reviews to file
   */
  writeReviews(reviews) {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(reviews, null, 2));
      logger.debug(TAG, `Wrote ${reviews.length} reviews to file`);
    } catch (err) {
      logger.error(TAG, `Failed to write reviews: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all reviews
   */
  getAllReviews() {
    return this.readReviews();
  }

  /**
   * Get review by ID
   */
  getReviewById(id) {
    const reviews = this.readReviews();
    return reviews.find(r => r.id === parseInt(id));
  }

  /**
   * Create new review
   */
  createReview(reviewData) {
    const reviews = this.readReviews();
    const nextId = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    
    const newReview = {
      id: nextId,
      ...reviewData,
      createdAt: new Date().toISOString()
    };
    
    reviews.push(newReview);
    this.writeReviews(reviews);
    
    logger.info(TAG, `Created new review with ID: ${nextId}`);
    return newReview;
  }

  /**
   * Update review
   */
  updateReview(id, updates) {
    const reviews = this.readReviews();
    const index = reviews.findIndex(r => r.id === parseInt(id));
    
    if (index === -1) {
      logger.warn(TAG, `Review not found: ${id}`);
      return null;
    }
    
    reviews[index] = {
      ...reviews[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.writeReviews(reviews);
    logger.info(TAG, `Updated review: ${id}`);
    return reviews[index];
  }

  /**
   * Delete review
   */
  deleteReview(id) {
    const reviews = this.readReviews();
    const index = reviews.findIndex(r => r.id === parseInt(id));
    
    if (index === -1) {
      logger.warn(TAG, `Review not found: ${id}`);
      return false;
    }
    
    reviews.splice(index, 1);
    this.writeReviews(reviews);
    logger.info(TAG, `Deleted review: ${id}`);
    return true;
  }

  /**
   * Get next review ID
   */
  getNextId() {
    const reviews = this.readReviews();
    return reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
  }
}

module.exports = ReviewsService;
