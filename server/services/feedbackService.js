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
   * Now supports component-level adjustments
   */
  submitFeedback(sourcePath, imageId, aiScore, userScore, reasoning, components, adjustedComponents = null, adjustmentDetails = null) {
    const feedbackData = this.loadFeedback(sourcePath);
    
    const entry = {
      imageId,
      aiScore: Math.round(aiScore),
      userScore: Math.round(userScore),
      correction: userScore - aiScore,
      reasoning: reasoning || '',
      components: components || {},
      // NEW: Track user's adjusted component scores
      adjustedComponents: adjustedComponents || null,
      // NEW: Track which components were adjusted and by how much
      adjustmentDetails: adjustmentDetails || null,
      timestamp: new Date().toISOString()
    };

    feedbackData.entries.push(entry);
    this.saveFeedback(feedbackData, sourcePath);
    
    this.logger.info('Feedback', `Recorded feedback with component adjustments for ${imageId}`);
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
   * Analyze component adjustment patterns
   * Shows which components users adjust most frequently and by how much
   */
  analyzeComponentAdjustments(sourcePath) {
    const feedbackData = this.loadFeedback(sourcePath);
    const entries = feedbackData.entries || [];

    if (entries.length === 0) {
      return {
        status: 'no_data',
        message: 'No feedback entries yet',
        componentStats: {}
      };
    }

    // Track component adjustment statistics
    const componentStats = {
      anatomy: { adjustedCount: 0, adjustments: [], avgChange: 0 },
      pose: { adjustedCount: 0, adjustments: [], avgChange: 0 },
      face: { adjustedCount: 0, adjustments: [], avgChange: 0 },
      background: { adjustedCount: 0, adjustments: [], avgChange: 0 },
      objects: { adjustedCount: 0, adjustments: [], avgChange: 0 },
      coherence: { adjustedCount: 0, adjustments: [], avgChange: 0 }
    };

    let entriesWithComponentAdjustments = 0;

    entries.forEach(entry => {
      if (entry.adjustmentDetails && Object.keys(entry.adjustmentDetails).length > 0) {
        entriesWithComponentAdjustments++;
        
        Object.entries(entry.adjustmentDetails).forEach(([component, details]) => {
          if (componentStats[component]) {
            componentStats[component].adjustedCount++;
            componentStats[component].adjustments.push(details.change);
          }
        });
      }
    });

    // Calculate averages and frequencies
    const analysisResults = {};
    Object.entries(componentStats).forEach(([component, stats]) => {
      if (stats.adjustedCount > 0) {
        stats.avgChange = stats.adjustments.reduce((a, b) => a + b, 0) / stats.adjustments.length;
        
        analysisResults[component] = {
          adjustedCount: stats.adjustedCount,
          adjustmentFrequency: Math.round((stats.adjustedCount / entriesWithComponentAdjustments) * 100),
          averageChange: Math.round(stats.avgChange * 100) / 100,
          minChange: Math.min(...stats.adjustments),
          maxChange: Math.max(...stats.adjustments)
        };
      }
    });

    // Calculate weight suggestions based on adjustment frequency
    const weightSuggestions = this.calculateWeightSuggestions(analysisResults);

    return {
      status: 'success',
      totalFeedback: entries.length,
      entriesWithComponentAdjustments: entriesWithComponentAdjustments,
      componentStats: analysisResults,
      weightSuggestions: weightSuggestions,
      recommendation: this.getAdjustmentRecommendation(analysisResults)
    };
  }

  /**
   * Calculate suggested weight adjustments based on component adjustment patterns
   */
  calculateWeightSuggestions(componentStats) {
    // Current weights for illustrations
    const currentWeights = {
      anatomy: 0.15,
      pose: 0.15,
      face: 0.20,
      background: 0.15,
      objects: 0.20,
      coherence: 0.15
    };

    const suggestions = {};
    let totalFrequency = Object.values(componentStats).reduce((sum, c) => sum + (c.adjustmentFrequency || 0), 0);

    if (totalFrequency === 0) {
      return null; // No adjustments yet
    }

    // Suggest weight increases for components that are frequently adjusted upward
    Object.entries(componentStats).forEach(([component, stats]) => {
      if (stats.averageChange > 0.5) { // Users frequently increase this component
        suggestions[component] = {
          suggestion: 'INCREASE',
          reason: `Users frequently increase ${component} scores (avg +${stats.averageChange})`,
          currentWeight: currentWeights[component],
          suggestedWeight: Math.min(currentWeights[component] + 0.05, 0.25)
        };
      } else if (stats.averageChange < -0.5) { // Users frequently decrease this component
        suggestions[component] = {
          suggestion: 'DECREASE',
          reason: `Users frequently decrease ${component} scores (avg ${stats.averageChange})`,
          currentWeight: currentWeights[component],
          suggestedWeight: Math.max(currentWeights[component] - 0.05, 0.05)
        };
      }
    });

    return Object.keys(suggestions).length > 0 ? suggestions : null;
  }

  /**
   * Get human-readable recommendation based on adjustment patterns
   */
  getAdjustmentRecommendation(componentStats) {
    const sorted = Object.entries(componentStats)
      .sort((a, b) => (b[1].adjustmentFrequency || 0) - (a[1].adjustmentFrequency || 0))
      .slice(0, 3); // Top 3 most adjusted components

    if (sorted.length === 0) {
      return 'Not enough adjustment data to make recommendations yet.';
    }

    const topComponents = sorted.map(([comp, stats]) => `${comp} (${stats.adjustmentFrequency}%)`).join(', ');
    return `Users most frequently adjust: ${topComponents}. Consider re-weighing these components in the scoring algorithm.`;
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
