const express = require('express');

function createFeedbackRoutes(feedbackService) {
  const router = express.Router();

  /**
   * POST /api/feedback/submit
   * Submit user feedback for an image (correction to AI score)
   * Now supports component-level adjustments
   */
  router.post('/submit', (req, res) => {
    try {
      const { imageId, aiScore, userScore, reasoning, components, sourcePath, adjustedComponents, adjustmentDetails } = req.body;

      if (!imageId || aiScore === undefined || userScore === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      console.log(`[Feedback] Received imageId (length: ${imageId.length}): ${imageId}`);

      // Use provided sourcePath
      if (!sourcePath) {
        return res.status(400).json({ error: 'Source path is required' });
      }

      const entry = feedbackService.submitFeedback(
        sourcePath,
        imageId,
        aiScore,
        userScore,
        reasoning,
        components,
        adjustedComponents,
        adjustmentDetails
      );

      console.log(`[Feedback] New entry: ${imageId} | AI: ${aiScore} → User: ${userScore} | Correction: ${entry.correction}`);
      if (adjustmentDetails && Object.keys(adjustmentDetails).length > 0) {
        console.log(`[Feedback] Component adjustments:`, adjustmentDetails);
      }

      const feedbackData = feedbackService.loadFeedback(sourcePath);
      res.json({
        success: true,
        entry,
        feedbackCount: feedbackData.entries.length,
        message: 'Feedback recorded. AI will learn from your corrections!'
      });

    } catch (err) {
      console.error('[Feedback] Submit failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/feedback/analysis
   * Analyze feedback patterns to suggest weight adjustments
   */
  router.get('/analysis', (req, res) => {
    try {
      const sourcePath = req.query.sourcePath;
      if (!sourcePath) {
        return res.status(400).json({ error: 'Missing sourcePath' });
      }

      const analysis = feedbackService.analyzePatterns(sourcePath);
      res.json(analysis);

    } catch (err) {
      console.error('[Feedback] Analysis failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/feedback/component-adjustments
   * Analyze component-level adjustment patterns
   */
  router.get('/component-adjustments', (req, res) => {
    try {
      const sourcePath = req.query.sourcePath;
      if (!sourcePath) {
        return res.status(400).json({ error: 'Missing sourcePath' });
      }

      const componentAnalysis = feedbackService.analyzeComponentAdjustments(sourcePath);
      res.json(componentAnalysis);

    } catch (err) {
      console.error('[Feedback] Component adjustments analysis failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/feedback/stats
   * Get feedback statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const sourcePath = req.query.sourcePath;
      if (!sourcePath) {
        return res.status(400).json({ error: 'Missing sourcePath' });
      }

      const stats = feedbackService.getStatistics(sourcePath);
      res.json(stats);

    } catch (err) {
      console.error('[Feedback] Stats failed:', err);
      res.status(500).json({ 
        success: false,
        error: err.message 
      });
    }
  });

  /**
   * GET /api/feedback/list
   * Get all feedback entries (for debugging/review)
   */
  router.get('/list', (req, res) => {
    try {
      const sourcePath = req.query.sourcePath;
      if (!sourcePath) {
        return res.status(400).json({ error: 'Missing sourcePath' });
      }

      const feedbackData = feedbackService.loadFeedback(sourcePath);
      res.json(feedbackData);

    } catch (err) {
      console.error('[Feedback] List failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/feedback/clear
   * Clear all feedback (careful with this!)
   */
  router.delete('/clear', (req, res) => {
    try {
      const sourcePath = req.query.sourcePath;
      if (!sourcePath) {
        return res.status(400).json({ error: 'Missing sourcePath' });
      }

      feedbackService.clearFeedback(sourcePath);
      res.json({ success: true, message: 'All feedback cleared' });

    } catch (err) {
      console.error('[Feedback] Clear failed:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createFeedbackRoutes;
