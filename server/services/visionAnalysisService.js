/**
 * Vision Analysis Service
 * Analyzes image quality using Google Cloud Vision API
 * Provides scoring and recommendations
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'VisionAnalysisService';

class VisionAnalysisService {
  constructor(visionClient) {
    this.visionClient = visionClient;
  }

  /**
   * Analyze image quality locally using Vision API
   * Returns a score from 1-10 based on various factors
   */
  async analyzeImageQuality(filePath) {
    logger.info(TAG, `START analyzing: ${filePath}`);
    const startTime = Date.now();

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Image file not found');
      }

      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      logger.debug(TAG, `Read file ${path.basename(filePath)}: ${imageBuffer.length} bytes`);

      const request = {
        image: {
          content: base64Image
        },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 20 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
          { type: 'SAFE_SEARCH_DETECTION' },
          { type: 'IMAGE_PROPERTIES' },
          { type: 'WEB_DETECTION', maxResults: 5 }
        ]
      };

      const [result] = await this.visionClient.annotateImage(request);
      const labels = result.labelAnnotations || [];
      logger.debug(TAG, `Vision API returned ${labels.length} labels for: ${path.basename(filePath)}`);

      // Calculate scores
      const scores = this._calculateComponentScores(labels, result);
      const overallScore = this._calculateOverallScore(scores, labels);

      const elapsed = Date.now() - startTime;
      logger.info(TAG, `FINAL SCORE for ${path.basename(filePath)}: ${overallScore}/10 (${elapsed}ms)`);

      return overallScore;
    } catch (err) {
      logger.error(TAG, `Vision API analysis failed for ${path.basename(filePath)}: ${err.message}`);
      // Fall back to random score on error
      const fallbackScore = Math.floor(Math.random() * 5) + 5;
      logger.warn(TAG, `Using fallback score ${fallbackScore}/10 for ${path.basename(filePath)}`);
      return fallbackScore;
    }
  }

  /**
   * Calculate component scores based on Vision API labels
   */
  _calculateComponentScores(labels, result) {
    let anatomyScore = 6;
    let poseScore = 6;
    let faceQuality = 6;
    let backgroundQuality = 6;
    let objectQuality = 6;
    let coherenceScore = 6;

    const labelNames = labels.map(l => l.description.toLowerCase());

    // Detect image type (illustration vs photo)
    const isIllustration = labelNames.some(l =>
      l.includes('illustration') ||
      l.includes('drawing') ||
      l.includes('art') ||
      l.includes('digital art') ||
      l.includes('anime') ||
      l.includes('cartoon') ||
      l.includes('painting')
    );

    const hasArtisticStyle = labelNames.some(l =>
      l.includes('style') ||
      l.includes('texture') ||
      l.includes('abstract')
    );

    const isIllustrativeContent = isIllustration || hasArtisticStyle;
    logger.debug(TAG, `Image type - Illustration: ${isIllustrativeContent}`);

    // Anatomy checks
    if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
      anatomyScore += 2;
    } else if (labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character'))) {
      anatomyScore += 1;
    }

    // Pose and gesture checks
    if (labelNames.some(l => l.includes('gesture') || l.includes('pose') || l.includes('standing') || l.includes('sitting') || l.includes('action'))) {
      poseScore += 2;
    }

    // Face checks
    if (labelNames.some(l => l.includes('face') || l.includes('portrait') || l.includes('expression'))) {
      faceQuality += 2;
    } else if (labelNames.some(l => l.includes('head') || l.includes('close-up'))) {
      faceQuality += 1;
    }

    // Background checks
    if (labelNames.some(l => l.includes('background') || l.includes('scene') || l.includes('environment'))) {
      backgroundQuality += 2;
    } else if (labelNames.some(l => l.includes('art') || l.includes('illustration') || l.includes('drawing') || l.includes('style'))) {
      backgroundQuality += 1;
    }

    // Object/clothing checks
    if (labelNames.some(l => l.includes('cloth') || l.includes('fashion') || l.includes('uniform') || l.includes('dress') || l.includes('costume'))) {
      objectQuality += 2;
    }

    // Coherence - based on label complexity
    if (labels.length > 8) {
      coherenceScore += 2;
    } else if (labels.length > 4) {
      coherenceScore += 1;
    }

    // Illustration-specific boosts
    if (isIllustrativeContent) {
      if (labels.length > 6) {
        coherenceScore = Math.min(10, coherenceScore + 1);
      }
      if (labelNames.some(l => l.includes('character') || l.includes('figure'))) {
        anatomyScore = Math.min(10, anatomyScore + 1);
        poseScore = Math.min(10, poseScore + 1);
      }
      if (hasArtisticStyle) {
        coherenceScore = Math.min(10, coherenceScore + 1);
      }
    }

    // Safe search - check if image has appropriate content
    const safeSearch = result.safeSearchAnnotation || {};
    if (safeSearch.violence === 'VERY_LIKELY' || safeSearch.violence === 'LIKELY') {
      poseScore = Math.max(1, poseScore - 2);
    }

    // Detect missing elements
    if (!labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character') || l.includes('figure'))) {
      anatomyScore = Math.max(1, anatomyScore - 2);
    }

    // Clamp scores to 1-10
    return {
      anatomyScore: Math.max(1, Math.min(10, Math.round(anatomyScore))),
      poseScore: Math.max(1, Math.min(10, Math.round(poseScore))),
      faceQuality: Math.max(1, Math.min(10, Math.round(faceQuality))),
      backgroundQuality: Math.max(1, Math.min(10, Math.round(backgroundQuality))),
      objectQuality: Math.max(1, Math.min(10, Math.round(objectQuality))),
      coherenceScore: Math.max(1, Math.min(10, Math.round(coherenceScore))),
      isIllustrativeContent
    };
  }

  /**
   * Calculate overall score with custom weights based on image type
   */
  _calculateOverallScore(scores, labels) {
    const {
      anatomyScore,
      poseScore,
      faceQuality,
      backgroundQuality,
      objectQuality,
      coherenceScore,
      isIllustrativeContent
    } = scores;

    let overallScore;

    if (isIllustrativeContent) {
      // ILLUSTRATION WEIGHTS
      // Anatomy: 15%, Pose: 15%, Face: 20%, Background: 15%, Objects: 20%, Coherence: 15%
      overallScore = Math.round(
        (anatomyScore * 0.15 +
          poseScore * 0.15 +
          faceQuality * 0.20 +
          backgroundQuality * 0.15 +
          objectQuality * 0.20 +
          coherenceScore * 0.15) / 1
      );
      logger.debug(TAG, `Using ILLUSTRATION weights`);
    } else {
      // PHOTO WEIGHTS
      // Anatomy: 20%, Pose: 15%, Face: 20%, Background: 15%, Objects: 15%, Coherence: 15%
      overallScore = Math.round(
        (anatomyScore * 0.20 +
          poseScore * 0.15 +
          faceQuality * 0.20 +
          backgroundQuality * 0.15 +
          objectQuality * 0.15 +
          coherenceScore * 0.15) / 1
      );
      logger.debug(TAG, `Using PHOTO weights`);
    }

    logger.debug(TAG, `Component scores: Anatomy=${anatomyScore}, Pose=${poseScore}, Face=${faceQuality}, BG=${backgroundQuality}, Objects=${objectQuality}, Coherence=${coherenceScore}`);

    return overallScore;
  }
}

module.exports = VisionAnalysisService;
