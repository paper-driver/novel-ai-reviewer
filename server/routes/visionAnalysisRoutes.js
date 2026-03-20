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

      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');

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

      const [result] = await visionAnalysisService.visionClient.annotateImage(request);
      const labels = result.labelAnnotations || [];
      const objects = result.localizedObjectAnnotations || [];
      const safeSearch = result.safeSearchAnnotation || {};
      const colors = result.imagePropertiesAnnotation?.dominantColors?.colors || [];

      // Analyze labels
      let anatomyScore = 6;
      let poseScore = 6;
      let faceQuality = 6;
      let backgroundQuality = 6;
      let objectQuality = 6;
      let coherenceScore = 6;
      const issues = [];
      const strengths = [];
      const recommendations = [];

      const labelNames = labels.map(l => l.description.toLowerCase());
      const confidences = labels.map(l => l.score);
      const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b) / confidences.length * 100) : 0;

      // DETECT IMAGE TYPE: Photo vs Illustration
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
      logger.debug(TAG, `Image type - Illustration: ${isIllustrativeContent}, Labels: ${labelNames.join(', ')}`);

      // --- Anatomy Analysis ---
      if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
        anatomyScore = Math.min(10, anatomyScore + 2);
        strengths.push('Clear hand/arm anatomy');
      } else if (labelNames.some(l => l.includes('leg') || l.includes('foot'))) {
        anatomyScore = Math.min(10, anatomyScore + 1);
      }

      if (labelNames.some(l => l.includes('proportion') || l.includes('symmetr'))) {
        anatomyScore = Math.min(10, anatomyScore + 1);
        strengths.push('Good proportions');
      }

      // --- Pose & Gesture Analysis ---
      if (labelNames.some(l => l.includes('gesture') || l.includes('pose') || l.includes('standing') || l.includes('sitting') || l.includes('lying'))) {
        poseScore = Math.min(10, poseScore + 2);
        strengths.push('Good pose/gesture');
      }

      if (labelNames.some(l => l.includes('dynamic') || l.includes('action') || l.includes('motion'))) {
        poseScore = Math.min(10, poseScore + 1);
        strengths.push('Dynamic composition');
      }

      // --- Face Quality Analysis ---
      if (labelNames.some(l => l.includes('face') || l.includes('portrait'))) {
        faceQuality = Math.min(10, faceQuality + 2);
        strengths.push('Clear facial features');
      } else if (labelNames.some(l => l.includes('head') || l.includes('expression'))) {
        faceQuality = Math.min(10, faceQuality + 1);
      }

      if (labelNames.some(l => l.includes('eye') || l.includes('mouth') || l.includes('smile'))) {
        faceQuality = Math.min(10, faceQuality + 1);
        strengths.push('Expressive face');
      }

      // --- Background Analysis ---
      if (labelNames.some(l => l.includes('background') || l.includes('scene') || l.includes('landscape'))) {
        backgroundQuality = Math.min(10, backgroundQuality + 2);
        strengths.push('Well-defined background');
      } else if (labelNames.some(l => l.includes('art') || l.includes('illustration') || l.includes('drawing') || l.includes('style'))) {
        backgroundQuality = Math.min(10, backgroundQuality + 1);
      }

      if (labelNames.some(l => l.includes('nature') || l.includes('indoor') || l.includes('outdoor'))) {
        backgroundQuality = Math.min(10, backgroundQuality + 1);
      }

      // --- Object/Clothing Analysis ---
      if (labelNames.some(l => l.includes('cloth') || l.includes('fashion') || l.includes('uniform') || l.includes('dress') || l.includes('costume'))) {
        objectQuality = Math.min(10, objectQuality + 2);
        strengths.push('Good clothing detail');
      }

      if (objects.length > 3) {
        objectQuality = Math.min(10, objectQuality + 1);
        strengths.push(`${objects.length} objects clearly identified`);
      }

      // --- Coherence & Overall Composition ---
      if (labels.length > 12) {
        coherenceScore = Math.min(10, coherenceScore + 2);
        strengths.push('Complex, well-composed image');
      } else if (labels.length > 6) {
        coherenceScore = Math.min(10, coherenceScore + 1);
      }

      if (colors.length > 3) {
        coherenceScore = Math.min(10, coherenceScore + 1);
        strengths.push('Rich color palette');
      }

      // ILLUSTRATION-SPECIFIC BOOSTS
      if (isIllustrativeContent) {
        if (labels.length > 6) {
          coherenceScore = Math.min(10, coherenceScore + 1);
          if (!strengths.includes('Artistic composition')) {
            strengths.push('Artistic composition');
          }
        }
        
        if (labelNames.some(l => l.includes('character') || l.includes('figure'))) {
          anatomyScore = Math.min(10, anatomyScore + 1);
          poseScore = Math.min(10, poseScore + 1);
        }
        
        if (hasArtisticStyle) {
          coherenceScore = Math.min(10, coherenceScore + 1);
          if (!strengths.includes('Stylized artwork')) {
            strengths.push('Stylized artwork');
          }
        }
      }

      // --- Safety & Content Checks ---
      if (safeSearch.adult === 'VERY_LIKELY' || safeSearch.adult === 'LIKELY') {
        issues.push('Adult content detected');
      }
      if (safeSearch.violence === 'VERY_LIKELY' || safeSearch.violence === 'LIKELY') {
        issues.push('Violence detected');
        poseScore = Math.max(1, poseScore - 2);
      }

      // --- Issue Detection ---
      if (!labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character') || l.includes('figure'))) {
        issues.push('No clear subject/character detected');
        anatomyScore = Math.max(1, anatomyScore - 2);
      }

      if (labelNames.some(l => l.includes('low') || l.includes('blur') || l.includes('pixelat'))) {
        issues.push('Image quality issues detected');
        coherenceScore = Math.max(1, coherenceScore - 2);
        recommendations.push('Consider using a higher resolution image');
      }

      if (backgroundQuality < 5) {
        recommendations.push('Enhance background detail and definition');
      }

      if (anatomyScore < 5) {
        recommendations.push('Improve anatomical accuracy of the character');
      }

      // Clamp all scores to 1-10
      anatomyScore = Math.max(1, Math.min(10, Math.round(anatomyScore)));
      poseScore = Math.max(1, Math.min(10, Math.round(poseScore)));
      faceQuality = Math.max(1, Math.min(10, Math.round(faceQuality)));
      backgroundQuality = Math.max(1, Math.min(10, Math.round(backgroundQuality)));
      objectQuality = Math.max(1, Math.min(10, Math.round(objectQuality)));
      coherenceScore = Math.max(1, Math.min(10, Math.round(coherenceScore)));

      logger.debug(TAG, `Component scores: Anatomy=${anatomyScore}, Pose=${poseScore}, Face=${faceQuality}, BG=${backgroundQuality}, Objects=${objectQuality}, Coherence=${coherenceScore}`);

      // Save raw AI scores before any corrections
      const rawComponentScores = {
        anatomy: anatomyScore,
        pose: poseScore,
        face: faceQuality,
        background: backgroundQuality,
        objects: objectQuality,
        coherence: coherenceScore
      };

      // Calculate overall score with CUSTOM WEIGHTS based on image type
      let overallScore;
      
      if (isIllustrativeContent) {
        // ILLUSTRATION WEIGHTS
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

      const rawOverallScore = overallScore;

      // ===== Apply feedback corrections if available =====
      const imageId = path.basename(filePath);
      
      // Extract source folder from the full file path
      const pathParts = filePath.split(path.sep);
      let detectedSourcePath = null;
      
      // Try to find the source folder by looking for .ai-feedback.json
      for (let i = pathParts.length - 1; i >= 0; i--) {
        const feedbackFilePath = pathParts.slice(0, i).join(path.sep) + path.sep + '.ai-feedback.json';
        if (fs.existsSync(feedbackFilePath)) {
          detectedSourcePath = pathParts.slice(0, i).join(path.sep);
          break;
        }
      }
      
      const feedbackSourcePath = sourcePath || detectedSourcePath;
      const feedbackData = loadFeedback(feedbackSourcePath);
      
      // ===== PHASE 1: Apply learned patterns from ALL feedback =====
      const learnedPatterns = calculateLearnedPatterns(feedbackData);
      
      let componentScores = {
        anatomy: anatomyScore,
        pose: poseScore,
        face: faceQuality,
        background: backgroundQuality,
        objects: objectQuality,
        coherence: coherenceScore
      };
      
      // Apply learned patterns
      const adjustedScores = applyLearnedPatterns(componentScores, learnedPatterns);
      
      // Only apply if patterns were actually applied
      if (learnedPatterns) {
        let patternsApplied = false;
        for (const [component, pattern] of Object.entries(learnedPatterns)) {
          if (pattern.confidence >= 0.6 && adjustedScores[component] !== componentScores[component]) {
            patternsApplied = true;
            break;
          }
        }
        
        if (patternsApplied) {
          logger.debug(TAG, `Applying learned pattern corrections...`);
          anatomyScore = adjustedScores.anatomy;
          poseScore = adjustedScores.pose;
          faceQuality = adjustedScores.face;
          backgroundQuality = adjustedScores.background;
          objectQuality = adjustedScores.objects;
          coherenceScore = adjustedScores.coherence;
          
          // Recalculate overall score after pattern corrections
          if (isIllustrativeContent) {
            overallScore = Math.round(
              (anatomyScore * 0.15 + 
               poseScore * 0.15 + 
               faceQuality * 0.20 + 
               backgroundQuality * 0.15 + 
               objectQuality * 0.20 + 
               coherenceScore * 0.15)
            );
          } else {
            overallScore = Math.round(
              (anatomyScore * 0.20 + 
               poseScore * 0.15 + 
               faceQuality * 0.20 + 
               backgroundQuality * 0.15 + 
               objectQuality * 0.15 + 
               coherenceScore * 0.15)
            );
          }
          logger.debug(TAG, `Score after learned patterns: ${overallScore}/10`);
        }
      }
      
      // ===== PHASE 2: Check for specific image feedback =====
      const priorFeedback = feedbackData.entries.find(e => e.imageId === imageId);
      let feedbackApplied = false;
      let feedbackDetails = null;

      if (priorFeedback) {
        feedbackApplied = true;
        const feedbackComponents = priorFeedback.components || {};
        
        logger.info(TAG, `FEEDBACK FOUND for ${imageId}! Applying corrections...`);
        
        // Apply component-level corrections from user feedback
        if (feedbackComponents.anatomy !== undefined) {
          logger.debug(TAG, `   - Anatomy: ${anatomyScore} → ${feedbackComponents.anatomy}`);
          anatomyScore = feedbackComponents.anatomy;
        }
        if (feedbackComponents.pose !== undefined) {
          logger.debug(TAG, `   - Pose: ${poseScore} → ${feedbackComponents.pose}`);
          poseScore = feedbackComponents.pose;
        }
        if (feedbackComponents.face !== undefined) {
          logger.debug(TAG, `   - Face: ${faceQuality} → ${feedbackComponents.face}`);
          faceQuality = feedbackComponents.face;
        }
        if (feedbackComponents.background !== undefined) {
          logger.debug(TAG, `   - Background: ${backgroundQuality} → ${feedbackComponents.background}`);
          backgroundQuality = feedbackComponents.background;
        }
        if (feedbackComponents.objects !== undefined) {
          logger.debug(TAG, `   - Objects: ${objectQuality} → ${feedbackComponents.objects}`);
          objectQuality = feedbackComponents.objects;
        }
        if (feedbackComponents.coherence !== undefined) {
          logger.debug(TAG, `   - Coherence: ${coherenceScore} → ${feedbackComponents.coherence}`);
          coherenceScore = feedbackComponents.coherence;
        }

        // Recalculate overall score with user feedback
        if (isIllustrativeContent) {
          overallScore = Math.round(
            (anatomyScore * 0.15 + 
             poseScore * 0.15 + 
             faceQuality * 0.20 + 
             backgroundQuality * 0.15 + 
             objectQuality * 0.20 + 
             coherenceScore * 0.15)
          );
        } else {
          overallScore = Math.round(
            (anatomyScore * 0.20 + 
             poseScore * 0.15 + 
             faceQuality * 0.20 + 
             backgroundQuality * 0.15 + 
             objectQuality * 0.15 + 
             coherenceScore * 0.15)
          );
        }
        
        feedbackDetails = {
          userCorrection: priorFeedback.userScore - priorFeedback.aiScore,
          components: feedbackComponents,
          reasoning: priorFeedback.reasoning || ''
        };
        
        logger.info(TAG, `Applied feedback corrections. Score: ${rawOverallScore} → ${overallScore}`);
      }

      const response = {
        overallScore,
        rawAIScore: rawOverallScore,
        anatomyScore,
        poseScore,
        faceQuality,
        backgroundQuality,
        objectQuality,
        coherenceScore,
        detectedIssues: issues,
        detectedStrengths: strengths.length > 0 ? strengths : ['Image analyzed successfully'],
        confidence: avgConfidence,
        analysis: `Vision API detected ${labels.length} labels and ${objects.length} objects`,
        recommendations: recommendations.length > 0 ? recommendations : [],
        labels: labels.slice(0, 10).map(l => ({ name: l.description, score: Math.round(l.score * 100) })),
        processingTime: 250,
        cost: '$0.0015',
        feedbackApplied: feedbackApplied,
        feedbackDetails: feedbackDetails,
        correctionDetails: null
      };

      logger.info(TAG, `Analysis complete: ${response.overallScore}/10 (${avgConfidence}% confidence)`);
      res.json(response);

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
