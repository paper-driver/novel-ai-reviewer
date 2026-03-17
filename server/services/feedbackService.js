const fs = require('fs');
const path = require('path');

// FeedbackService - Manages AI feedback data persistence and loading
// Responsibilities:
// - Load feedback from .ai-feedback.json files
// - Save feedback data
// - No business logic - purely data access

class FeedbackService {
  constructor(logger) {
    this.logger = logger;
    this.currentSourcePath = null;
  }

  loadFeedback(sourcePath = null) {
    const folderPath = sourcePath;

    if (!folderPath) {
      this.logger.debug('Feedback', 'No source path available, returning empty feedback');
      return { entries: [] };
    }

    const feedbackFile = path.join(folderPath, '.ai-feedback.json');
    try {
      if (fs.existsSync(feedbackFile)) {
        const data = fs.readFileSync(feedbackFile, 'utf8');
        const parsed = JSON.parse(data);
        this.logger.trace('Feedback', `Loaded ${parsed.entries?.length || 0} entries from feedback file`);
        return parsed;
      } else {
        this.logger.trace('Feedback', `No feedback file found at ${feedbackFile}`);
      }
    } catch (err) {
      this.logger.warn('Feedback', `Failed to load feedback from ${feedbackFile}: ${err.message}`);
    }
    return { entries: [] };
  }

  saveFeedback(feedbackData, sourcePath = null) {
    const folderPath = sourcePath || this.currentSourcePath;

    if (!folderPath) {
      this.logger.error('Feedback', 'No source path available, cannot save feedback');
      return;
    }

    const feedbackFile = path.join(folderPath, '.ai-feedback.json');
    try {
      fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2));
      this.logger.info('Feedback', `Saved ${feedbackData.entries.length} feedback entries`);
    } catch (err) {
      this.logger.error('Feedback', `Failed to save feedback: ${err.message}`);
    }
  }

  /**
   * Set current source path (called by legacy grouping endpoints)
   */
  setCurrentSourcePath(sourcePath) {
    this.currentSourcePath = sourcePath;
    this.logger.debug('Feedback', `Current source path set to: ${this.currentSourcePath}`);
  }

  /**
   * Get current source path
   */
  getCurrentSourcePath() {
    return this.currentSourcePath;
  }

  /**
   * Submit feedback for an image
   */
  submitFeedback(sourcePath, imageId, aiScore, userScore, reasoning, components) {
    const feedbackData = this.loadFeedback(sourcePath);
    
    const entry = {
      imageId,
      aiScore: Math.round(aiScore),
      userScore: Math.round(userScore),
      correction: userScore - aiScore,
      reasoning: reasoning || '',
      components: components || {},
      timestamp: new Date().toISOString()
    };

    feedbackData.entries.push(entry);
    this.saveFeedback(feedbackData, sourcePath);
    
    return entry;
  }

  /**
   * Get feedback statistics
   */
  getStatistics(sourcePath) {
    const feedbackData = this.loadFeedback(sourcePath);
    const entries = feedbackData.entries || [];

    if (entries.length === 0) {
      return {
        success: true,
        stats: {
          totalCorrections: 0,
          averageCorrection: 0,
          positiveCorrections: 0,
          negativeCorrections: 0,
          byComponent: {},
          sourceFolder: sourcePath
        }
      };
    }

    // Calculate statistics
    let totalCorrection = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    const componentStats = {};

    entries.forEach(entry => {
      const correction = entry.correction || 0;
      totalCorrection += correction;

      if (correction > 0.1) positiveCount++;
      else if (correction < -0.1) negativeCount++;

      // Track component-level statistics
      if (entry.components) {
        Object.entries(entry.components).forEach(([component, userScore]) => {
          const componentName = component.toLowerCase();
          if (!componentStats[componentName]) {
            componentStats[componentName] = {
              count: 0,
              scores: []
            };
          }

          componentStats[componentName].count++;
          componentStats[componentName].scores.push(userScore);
        });
      }
    });

    // Convert component stats to final format
    const byComponent = {};
    Object.entries(componentStats).forEach(([component, stats]) => {
      const minScore = Math.min(...stats.scores);
      const maxScore = Math.max(...stats.scores);
      const avgScore = stats.scores.reduce((a, b) => a + b) / stats.scores.length;

      byComponent[component] = {
        count: stats.count,
        averageScore: Math.round(avgScore * 10) / 10,
        min: minScore,
        max: maxScore
      };
    });

    const stats = {
      totalCorrections: entries.length,
      averageCorrection: Math.round((totalCorrection / entries.length) * 10) / 10,
      positiveCorrections: positiveCount,
      negativeCorrections: negativeCount,
      byComponent: byComponent,
      sourceFolder: sourcePath
    };

    return { success: true, stats };
  }

  /**
   * Analyze feedback patterns
   */
  analyzePatterns(sourcePath) {
    const feedbackData = this.loadFeedback(sourcePath);
    const entries = feedbackData.entries || [];

    if (entries.length < 5) {
      return {
        status: 'insufficient_data',
        message: `Need at least 5 corrections to analyze patterns. Current: ${entries.length}`,
        feedbackCount: entries.length
      };
    }

    // Calculate patterns
    const avgCorrection = entries.reduce((sum, e) => sum + (e.correction || 0), 0) / entries.length;
    const bias = avgCorrection > 0 ? 'AI scores too low' : 'AI scores too high';
    const biasAmount = Math.abs(avgCorrection);

    // Analyze component patterns
    const componentAnalysis = {};
    ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence'].forEach(comp => {
      const values = entries
        .filter(e => e.components && e.components[comp] !== undefined)
        .map(e => ({ score: e.components[comp] }));

      if (values.length > 0) {
        const avgScore = values.reduce((sum, v) => sum + v.score, 0) / values.length;

        componentAnalysis[comp] = {
          avgScore: Math.round(avgScore * 10) / 10,
          count: values.length
        };
      }
    });

    return {
      status: 'success',
      feedbackCount: entries.length,
      analysis: {
        overallBias: {
          description: bias,
          amount: Math.round(biasAmount * 100) / 100
        },
        componentPatterns: componentAnalysis
      }
    };
  }

  /**
   * Clear all feedback for a folder
   */
  clearFeedback(sourcePath) {
    const feedbackFile = path.join(sourcePath, '.ai-feedback.json');
    try {
      if (fs.existsSync(feedbackFile)) {
        fs.unlinkSync(feedbackFile);
        this.logger.info('Feedback', `Cleared feedback for: ${sourcePath}`);
      }
    } catch (err) {
      this.logger.error('Feedback', `Failed to clear feedback: ${err.message}`);
    }
  }
}

module.exports = FeedbackService;
