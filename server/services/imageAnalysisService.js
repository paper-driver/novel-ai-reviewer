const LpipsService = require('./lpipsService');

/**
 * Image Analysis Service
 * Orchestrates LPIPS and Google Vision API analysis for image pairs
 */
class ImageAnalysisService {
  constructor(visionAnalysisService) {
    this.lpipsService = new LpipsService();
    this.visionService = visionAnalysisService; // Injected service with properly initialized Vision client
    this.analysisCache = new Map(); // Cache analysis results
  }

  /**
   * Analyze image pair (runs LPIPS and Google Vision in parallel)
   * @param {string} imagePath_A - Path to first image (baseline)
   * @param {string} imagePath_B - Path to second image (with artist)
   * @param {string} artistName - Artist name for logging
   * @returns {Promise<object>} Analysis results with both scores
   */
  async analyzeImagePair(imagePath_A, imagePath_B, artistName = '') {
    try {
      // Check cache first
      const cacheKey = `${imagePath_A}:${imagePath_B}`;
      if (this.analysisCache.has(cacheKey)) {
        return this.analysisCache.get(cacheKey);
      }

      // Run both analyses in parallel
      const [lpipsScore, googleVisionScore] = await Promise.all([
        this.computeLPIPS(imagePath_A, imagePath_B),
        this.analyzeWithGoogleVision(imagePath_A, imagePath_B)
      ]);

      const result = {
        lpipsScore,
        googleVisionScore,
        hybridScore: this.calculateHybridScore(lpipsScore, googleVisionScore),
        timestamp: new Date().toISOString(),
        artistName
      };

      // Cache the result
      this.analysisCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`Error analyzing image pair for artist "${artistName}":`, error);
      throw error;
    }
  }

  /**
   * Compute LPIPS distance between two images
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @returns {Promise<number>} LPIPS score (0-1)
   */
  async computeLPIPS(imagePath_A, imagePath_B) {
    try {
      const score = await this.lpipsService.computeDistance(imagePath_A, imagePath_B);
      // Normalize to 0-1 range
      return Math.min(Math.max(score, 0), 1);
    } catch (error) {
      console.error('Error computing LPIPS:', error);
      throw error;
    }
  }

  /**
   * Analyze images with Google Vision API
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @returns {Promise<number>} Google Vision difference score (0-1)
   */
  async analyzeWithGoogleVision(imagePath_A, imagePath_B) {
    try {
      const score = await this.visionService.compareImages(imagePath_A, imagePath_B);
      // Normalize to 0-1 range
      return Math.min(Math.max(score, 0), 1);
    } catch (error) {
      console.error('Error analyzing with Google Vision:', error);
      throw error;
    }
  }

  /**
   * Calculate hybrid strength score
   * Formula: (GV × 0.33) + (LPIPS × 0.67)
   * @param {number} lpipsScore - LPIPS score (0-1)
   * @param {number} googleVisionScore - Google Vision score (0-1)
   * @returns {number} Hybrid score (0-1)
   */
  calculateHybridScore(lpipsScore, googleVisionScore) {
    const normalizedGV = Math.min(googleVisionScore / 0.4, 1); // Practical max: 0.4
    const normalizedLPIPS = Math.min(lpipsScore / 0.5, 1); // Practical max: 0.5

    return (normalizedGV * 0.33) + (normalizedLPIPS * 0.67);
  }

  /**
   * Get cached analysis result
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @returns {object|null} Cached result or null
   */
  getCachedAnalysis(imagePath_A, imagePath_B) {
    const cacheKey = `${imagePath_A}:${imagePath_B}`;
    return this.analysisCache.get(cacheKey) || null;
  }

  /**
   * Cache analysis result
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @param {object} result - Analysis result
   */
  cacheAnalysisResult(imagePath_A, imagePath_B, result) {
    const cacheKey = `${imagePath_A}:${imagePath_B}`;
    this.analysisCache.set(cacheKey, result);
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.analysisCache.clear();
  }

  /**
   * Get cache size (for debugging/monitoring)
   * @returns {number} Number of cached items
   */
  getCacheSize() {
    return this.analysisCache.size;
  }

  /**
   * Shutdown services (cleanup)
   */
  async shutdown() {
    try {
      await this.lpipsService.shutdown();
    } catch (error) {
      console.error('Error shutting down ImageAnalysisService:', error);
    }
  }
}

module.exports = ImageAnalysisService;
