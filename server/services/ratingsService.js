/**
 * Ratings Service
 * Handles loading and saving image ratings from .image-ratings.json files
 * Used by both Artist Gallery and Prompt Grouping components
 */

const fs = require('fs');
const path = require('path');

class RatingsService {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Load ratings from .image-ratings.json in the specified folder
   * @param {string} folderPath - The folder path containing .image-ratings.json
   * @returns {Object} Ratings object (key: filename, value: rating score)
   */
  loadRatings(folderPath) {
    try {
      const resolvedPath = path.resolve(folderPath);
      
      // Security: Ensure the path exists and is a directory
      if (!fs.existsSync(resolvedPath)) {
        this.logger.error('RatingsService', `Folder not found: ${resolvedPath}`);
        throw new Error('Folder not found');
      }

      const ratingsFile = path.join(resolvedPath, '.image-ratings.json');
      
      if (fs.existsSync(ratingsFile)) {
        const ratingsData = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
        this.logger.info('RatingsService', `Loaded ratings from: ${ratingsFile}`);
        this.logger.info('RatingsService', `Total entries: ${Object.keys(ratingsData).length}`);
        return ratingsData;
      } else {
        this.logger.info('RatingsService', `No ratings file found at: ${ratingsFile}`);
        return {};
      }
    } catch (err) {
      this.logger.error('RatingsService', `Failed to load ratings: ${err.message}`);
      throw err;
    }
  }

  /**
   * Save ratings to .image-ratings.json in the specified folder
   * Merges with existing ratings (does not overwrite)
   * @param {string} folderPath - The folder path where .image-ratings.json will be saved
   * @param {Object} ratings - New ratings to merge (key: filename, value: rating score)
   * @returns {Object} Result with totalEntries and newEntries counts
   */
  saveRatings(folderPath, ratings) {
    try {
      const resolvedPath = path.resolve(folderPath);
      
      // Security: Ensure the path exists and is a directory
      if (!fs.existsSync(resolvedPath)) {
        this.logger.error('RatingsService', `Folder not found: ${resolvedPath}`);
        throw new Error('Folder not found');
      }

      const ratingsFile = path.join(resolvedPath, '.image-ratings.json');
      
      // Load existing ratings
      let existingRatings = {};
      if (fs.existsSync(ratingsFile)) {
        try {
          existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
          this.logger.info('RatingsService', `Loaded existing ratings with ${Object.keys(existingRatings).length} entries`);
        } catch (parseErr) {
          this.logger.warn('RatingsService', `Failed to parse existing ratings file, starting fresh: ${parseErr.message}`);
          existingRatings = {};
        }
      }
      
      // Merge: existing + new (new ratings override old ones)
      const mergedRatings = { ...existingRatings, ...ratings };
      
      this.logger.info('RatingsService', `Existing: ${Object.keys(existingRatings).length} entries`);
      this.logger.info('RatingsService', `New: ${Object.keys(ratings).length} entries`);
      this.logger.info('RatingsService', `Merged: ${Object.keys(mergedRatings).length} entries`);
      
      // Save merged ratings
      fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
      this.logger.info('RatingsService', `Ratings saved to: ${ratingsFile}`);
      
      return {
        totalEntries: Object.keys(mergedRatings).length,
        newEntries: Object.keys(ratings).length
      };
    } catch (err) {
      this.logger.error('RatingsService', `Failed to save ratings: ${err.message}`);
      throw err;
    }
  }
}

module.exports = RatingsService;
