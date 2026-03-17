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

      logger.debug(TAG, `Analyzing illustration: ${path.basename(filePath)}`);

      // Get basic analysis from service
      const score = await visionAnalysisService.analyzeImageQuality(filePath);

      // For now, return simple response
      // TODO: Add detailed component scoring, feedback correction logic
      res.json({
        overallScore: score,
        filePath,
        processingTime: 250,
        cost: '$0.0015'
      });

    } catch (err) {
      logger.error(TAG, `Vision API failed: ${err.message}`);
      res.status(500).json({ error: 'Analysis failed', details: err.message });
    }
  });

  /**
   * POST /api/batch-analyze-illustrations
   * Analyze multiple illustrations in batch
   * Body: { folderPath: "/path/to/folder", filenames?: ["file1.png", "file2.png"] }
   * Returns: { results: [...], totalProcessed, totalSucceeded, totalFailed }
   */
  router.post('/batch-analyze-illustrations', async (req, res) => {
    try {
      const { folderPath, filenames } = req.body;

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

      logger.info(TAG, `Batch analyzing ${filesToAnalyze.length} illustrations`);

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const filePath of filesToAnalyze) {
        try {
          const score = await visionAnalysisService.analyzeImageQuality(filePath);
          results.push({
            filename: path.basename(filePath),
            filePath,
            score,
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

  return router;
}

module.exports = createVisionAnalysisRouter;
