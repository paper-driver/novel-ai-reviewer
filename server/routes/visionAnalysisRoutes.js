/**
 * Vision Analysis Routes
 * HTTP endpoints for image quality analysis using Vision API
 * Delegates analysis to VisionAnalysisService
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'VisionAnalysisRoutes';

function createVisionAnalysisRouter(visionAnalysisService, feedbackService) {
  const router = express.Router();

  /**
   * POST /api/analyze-image-quality
   * Analyze image quality using Vision API
   * Body: { filePath: "/path/to/image.png" }
   * Returns: { score: 1-10 }
   */
  router.post('/', async (req, res) => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
      }

      if (!fs.existsSync(filePath)) {
        logger.warn(TAG, `File not found: ${filePath}`);
        return res.status(400).json({ error: 'File not found' });
      }

      logger.info(TAG, `Analyzing image: ${filePath}`);
      const score = await visionAnalysisService.analyzeImageQuality(filePath);

      logger.info(TAG, `Analysis complete: score=${score}`);
      res.json({ filePath, score });
    } catch (err) {
      logger.error(TAG, `Failed to analyze image: ${err.message}`);
      res.status(500).json({ error: 'Failed to analyze image', details: err.message });
    }
  });

  /**
   * POST /api/analyze-illustration
   * Analyze a single illustration using Vision API with detailed feedback support
   * Body: { filePath: "/path/to/image.png", sourcePath?: "/path/to/source" }
   * Returns: { overallScore, componentScores, issues, strengths, recommendations, etc. }
   */
  router.post('/analyze-illustration', async (req, res) => {
    try {
      const { filePath, sourcePath } = req.body;

      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'File not found' });
      }

      logger.debug(TAG, `Analyzing image: ${path.basename(filePath)}`);

      // Use the service method which has the correct feedback logic
      const analysis = await visionAnalysisService.analyzeImageQualityDetailed(filePath, feedbackService, sourcePath);
      
      logger.info(TAG, `Analysis complete: ${analysis.overallScore}/10 (${analysis.confidence}% confidence)`);
      res.json(analysis);

    } catch (err) {
      logger.error(TAG, `Vision API failed: ${err.message}`);
      res.status(500).json({ error: 'Analysis failed', details: err.message });
    }
  });

  /**
   * POST /api/batch-analyze-illustrations
   * ⚠️ DEPRECATED: Not currently used by frontend
   * Analyze multiple illustrations in batch
   * NOW includes learned patterns from ALL feedback (same as single-image analysis)
   * Body: { folderPath: "/path/to/folder", filenames?: ["file1.png", "file2.png"], sourcePath?: "/path/to/feedback" }
   * Returns: { results: [...], totalProcessed, totalSucceeded, totalFailed }
   */
  router.post('/batch-analyze-illustrations', async (req, res) => {
    try {
      const { folderPath, filenames, sourcePath } = req.body;

      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path required' });
      }

      if (!fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Folder not found' });
      }

      // Get list of PNG files to analyze
      let filesToAnalyze = [];
      
      if (filenames && Array.isArray(filenames)) {
        filesToAnalyze = filenames.map(f => path.join(folderPath, f));
      } else {
        // Get all PNG files from folder
        filesToAnalyze = fs.readdirSync(folderPath)
          .filter(f => f.endsWith('.png') && !f.startsWith('.'))
          .map(f => path.join(folderPath, f));
      }

      const feedbackSourcePath = sourcePath || folderPath;
      logger.info(TAG, `Batch analyzing ${filesToAnalyze.length} illustrations with feedback from ${feedbackSourcePath}`);

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const filePath of filesToAnalyze) {
        try {
          // Use detailed analysis (includes learned patterns from feedback)
          const analysis = await visionAnalysisService.analyzeImageQualityDetailed(
            filePath,
            feedbackService,
            feedbackSourcePath
          );
          results.push({
            filename: path.basename(filePath),
            filePath,
            score: analysis.overallScore,
            components: {
              anatomy: analysis.anatomyScore,
              pose: analysis.poseScore,
              face: analysis.faceQuality,
              background: analysis.backgroundQuality,
              objects: analysis.objectQuality,
              coherence: analysis.coherenceScore
            },
            feedbackApplied: analysis.feedbackApplied,
            confidence: analysis.confidence,
            status: 'success'
          });
          successCount++;
        } catch (err) {
          logger.warn(TAG, `Failed to analyze ${path.basename(filePath)}: ${err.message}`);
          results.push({
            filename: path.basename(filePath),
            filePath,
            status: 'failed',
            error: err.message
          });
          failureCount++;
        }
      }

      logger.info(TAG, `Batch analysis complete: ${successCount} succeeded, ${failureCount} failed`);
      
      res.json({
        results,
        totalProcessed: filesToAnalyze.length,
        totalSucceeded: successCount,
        totalFailed: failureCount
      });

    } catch (err) {
      logger.error(TAG, `Batch analysis failed: ${err.message}`);
      res.status(500).json({ error: 'Batch analysis failed', details: err.message });
    }
  });

  /**
   * Calculate learned correction patterns from all feedback entries
   * Learns user's correction tendencies and applies them to new images
   */
  function calculateLearnedPatterns(feedbackData) {
    if (!feedbackData.entries || feedbackData.entries.length === 0) {
      return null;
    }

    const patterns = {};
    const components = ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence'];
    
    // Sort entries by timestamp for recency weighting
    const sortedEntries = [...feedbackData.entries].sort((a, b) => {
      const dateA = new Date(a.timestamp || 0).getTime();
      const dateB = new Date(b.timestamp || 0).getTime();
      return dateB - dateA; // Newest first
    });

    const totalEntries = sortedEntries.length;

    for (const component of components) {
      const corrections = [];
      let weightedSum = 0;
      let totalWeight = 0;

      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        
        // Recency weight: newer entries get higher weight
        const recencyFactor = Math.exp(-i / Math.max(1, totalEntries - 1) * 2);
        
        if (entry.components && entry.components[component] !== undefined) {
          const userComponentScore = entry.components[component];
          
          corrections.push({
            imageId: entry.imageId,
            userScore: userComponentScore,
            aiScore: entry.aiScore,
            timestamp: entry.timestamp,
            recencyWeight: recencyFactor
          });

          weightedSum += userComponentScore * recencyFactor;
          totalWeight += recencyFactor;
        }
      }

      if (corrections.length > 0) {
        const weightedAvg = weightedSum / totalWeight;
        
        // Calculate confidence based on consistency
        const values = corrections.map(c => c.userScore);
        const mean = values.reduce((a, b) => a + b) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        // Confidence is inverse of std dev
        const confidence = Math.max(0, 1 - (stdDev / 5));

        patterns[component] = {
          avg: Math.round(weightedAvg * 10) / 10,
          count: corrections.length,
          confidence: Math.round(confidence * 100) / 100,
          stdDev: Math.round(stdDev * 100) / 100
        };
      }
    }

    return Object.keys(patterns).length > 0 ? patterns : null;
  }

  /**
   * Apply learned correction patterns to component scores
   */
  function applyLearnedPatterns(componentScores, learnedPatterns) {
    if (!learnedPatterns) {
      return componentScores;
    }

    const adjusted = { ...componentScores };
    let appliedCount = 0;

    for (const [component, pattern] of Object.entries(learnedPatterns)) {
      if (adjusted[component] !== undefined && pattern.confidence >= 0.6) {
        const originalScore = adjusted[component];
        
        // Apply the learned average adjustment, clamped to ±2 points
        const maxAdjustment = 2;
        const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, pattern.avg));
        
        adjusted[component] = Math.max(1, Math.min(10, originalScore + adjustment));

        if (adjusted[component] !== originalScore) {
          logger.trace(TAG, `${component}: ${originalScore} → ${adjusted[component]} (confidence: ${pattern.confidence})`);
          appliedCount++;
        }
      }
    }

    if (appliedCount > 0) {
      logger.debug(TAG, `Applied ${appliedCount} learned pattern corrections`);
    }

    return adjusted;
  }

  /**
   * Load feedback data from JSON file
   */
  function loadFeedback(sourcePath) {
    if (!sourcePath) {
      return { entries: [] };
    }

    const feedbackFile = path.join(sourcePath, '.ai-feedback.json');
    try {
      if (fs.existsSync(feedbackFile)) {
        const data = fs.readFileSync(feedbackFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      logger.warn(TAG, `Failed to load feedback: ${err.message}`);
    }

    return { entries: [] };
  }

  return router;
}

module.exports = createVisionAnalysisRouter;
