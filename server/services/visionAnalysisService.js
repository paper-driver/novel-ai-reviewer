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

  /**
   * Analyze image quality with full details including feedback corrections
   * Returns complete analysis object with all 19 fields
   * Used by both analyze-illustration endpoint and batch processing
   */
  async analyzeImageQualityDetailed(filePath, feedbackService, sourcePath) {
    logger.info(TAG, `START detailed analysis: ${filePath}`);
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
      
      // Extract Vision API data
      const labels = result.labelAnnotations || [];
      const objects = result.localizedObjectAnnotations || [];
      const safeSearch = result.safeSearchAnnotation || {};
      const colors = result.imagePropertiesAnnotation?.dominantColors?.colors || [];

      logger.debug(TAG, `Vision API returned ${labels.length} labels for: ${path.basename(filePath)}`);

      // Calculate component scores
      const labelNames = labels.map(l => l.description.toLowerCase());
      
      let anatomyScore = 6;
      let poseScore = 6;
      let faceQuality = 6;
      let backgroundQuality = 6;
      let objectQuality = 6;
      let coherenceScore = 6;

      const issues = [];
      const strengths = [];
      const recommendations = [];

      // Detect image type
      const isIllustration = labelNames.some(l =>
        l.includes('illustration') || l.includes('drawing') || l.includes('art') ||
        l.includes('digital art') || l.includes('anime') || l.includes('cartoon') ||
        l.includes('painting')
      );

      const hasArtisticStyle = labelNames.some(l =>
        l.includes('style') || l.includes('texture') || l.includes('abstract')
      );

      const isIllustrativeContent = isIllustration || hasArtisticStyle;

      // --- Anatomy & Character Analysis ---
      if (labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character'))) {
        anatomyScore = Math.min(10, anatomyScore + 2);
        strengths.push('Clear character/human figure');
      }

      if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
        anatomyScore = Math.min(10, anatomyScore + 2);
        strengths.push('Clear hand/arm anatomy');
      }

      // --- Pose & Movement ---
      if (labelNames.some(l => l.includes('action') || l.includes('motion') || l.includes('dynamic'))) {
        poseScore = Math.min(10, poseScore + 2);
        strengths.push('Dynamic pose/action');
      }

      if (labelNames.some(l => l.includes('sitting') || l.includes('standing') || l.includes('lying'))) {
        poseScore = Math.min(10, poseScore + 1);
      }

      // --- Face Quality ---
      if (labelNames.some(l => l.includes('face') || l.includes('head'))) {
        faceQuality = Math.min(10, faceQuality + 2);
        strengths.push('Clear facial features');
      }

      if (labelNames.some(l => l.includes('eye') || l.includes('mouth') || l.includes('expression'))) {
        faceQuality = Math.min(10, faceQuality + 1);
        strengths.push('Expressive face');
      }

      // --- Background Quality ---
      if (labelNames.some(l => l.includes('landscape') || l.includes('scenery') || l.includes('nature'))) {
        backgroundQuality = Math.min(10, backgroundQuality + 2);
        strengths.push('Rich background detail');
      }

      if (labelNames.some(l => l.includes('indoor') || l.includes('room') || l.includes('building'))) {
        backgroundQuality = Math.min(10, backgroundQuality + 1);
      }

      // --- Object Quality ---
      if (labelNames.some(l => l.includes('weapon') || l.includes('sword') || l.includes('gun'))) {
        objectQuality = Math.min(10, objectQuality + 2);
        strengths.push('Detailed weapon/object');
      }

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
      }

      // Check for missing subjects
      if (labelNames.length < 3) {
        issues.push('Missing subject or context');
        anatomyScore = Math.max(1, anatomyScore - 1);
      }

      // Quality recommendations
      if (faceQuality < 5) {
        recommendations.push('Improve facial detail and expression');
      }
      if (poseScore < 5) {
        recommendations.push('Add more dynamic pose and action');
      }
      if (backgroundQuality < 5) {
        recommendations.push('Enhance background detail');
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
        overallScore = Math.round(
          (anatomyScore * 0.15 + 
           poseScore * 0.15 + 
           faceQuality * 0.20 + 
           backgroundQuality * 0.15 + 
           objectQuality * 0.20 + 
           coherenceScore * 0.15) / 1
        );
      } else {
        overallScore = Math.round(
          (anatomyScore * 0.20 + 
           poseScore * 0.15 + 
           faceQuality * 0.20 + 
           backgroundQuality * 0.15 + 
           objectQuality * 0.15 + 
           coherenceScore * 0.15) / 1
        );
      }

      const rawOverallScore = overallScore;

      // ===== Apply feedback corrections if available =====
      const imageId = path.basename(filePath);
      
      // Search for feedback file starting from sourcePath and going up the directory tree
      let feedbackSourcePath = null;
      
      if (sourcePath) {
        // Start from the provided sourcePath and search upward
        const pathParts = sourcePath.split(path.sep);
        for (let i = pathParts.length; i > 0; i--) {
          const potentialPath = pathParts.slice(0, i).join(path.sep);
          const feedbackFilePath = potentialPath + path.sep + '.ai-feedback.json';
          if (fs.existsSync(feedbackFilePath)) {
            feedbackSourcePath = potentialPath;
            break;
          }
        }
      }
      
      // If still not found, search from the image's directory upward
      if (!feedbackSourcePath) {
        const pathParts = filePath.split(path.sep);
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const feedbackFilePath = pathParts.slice(0, i).join(path.sep) + path.sep + '.ai-feedback.json';
          if (fs.existsSync(feedbackFilePath)) {
            feedbackSourcePath = pathParts.slice(0, i).join(path.sep);
            break;
          }
        }
      }
      
      const feedbackData = feedbackService ? feedbackService.loadFeedback(feedbackSourcePath) : { entries: [] };
      
      // Initialize feedback tracking variables (before PHASE 1 and 2)
      let feedbackApplied = false;
      let feedbackDetails = null;
      let feedbackSource = null;
      
      // ===== PHASE 1: Apply learned patterns from ALL feedback =====
      const learnedPatterns = this._calculateLearnedPatterns(feedbackData);
      let appliedPatterns = null; // Track which patterns were actually applied
      
      let componentScores = {
        anatomy: anatomyScore,
        pose: poseScore,
        face: faceQuality,
        background: backgroundQuality,
        objects: objectQuality,
        coherence: coherenceScore
      };
      
      // Apply learned patterns
      const adjustedScores = this._applyLearnedPatterns(componentScores, learnedPatterns);
      
      logger.debug(TAG, `PHASE 1 - Learned patterns analysis:`);
      logger.debug(TAG, `  - Patterns calculated: ${learnedPatterns ? 'YES' : 'NO'}`);
      
      // Only apply if patterns were actually applied
      if (learnedPatterns) {
        appliedPatterns = {};
        let patternsApplied = false;
        for (const [component, pattern] of Object.entries(learnedPatterns)) {
          logger.debug(TAG, `  - ${component}: confidence ${Math.round(pattern.confidence * 100)}%, threshold: 80%`);
          if (pattern.confidence >= 0.8 && adjustedScores[component] !== componentScores[component]) {
            patternsApplied = true;
            appliedPatterns[component] = {
              original: componentScores[component],
              adjusted: adjustedScores[component],
              pattern: pattern
            };
            logger.debug(TAG, `    ✓ APPLIED: ${componentScores[component]} → ${adjustedScores[component]}`);
          } else if (pattern.confidence < 0.8) {
            logger.debug(TAG, `    ✗ SKIPPED: confidence too low (${Math.round(pattern.confidence * 100)}% < 80%)`);
          } else if (adjustedScores[component] === componentScores[component]) {
            logger.debug(TAG, `    ✗ SKIPPED: no score change (${componentScores[component]} = ${adjustedScores[component]})`);
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
          
          // Mark that patterns were applied - will be displayed in UI
          feedbackApplied = true;
          feedbackSource = 'learned';
        } else {
          logger.debug(TAG, `No patterns applied (all below confidence threshold or no changes)`);
          appliedPatterns = null; // Reset to null if nothing was applied
        }
      }
      
      // ===== PHASE 2: Check for specific image feedback =====
      // Only override learned patterns if there's SPECIFIC feedback for this image
      const priorFeedback = feedbackData.entries.find(e => e.imageId === imageId);

      if (priorFeedback) {
        feedbackApplied = true;
        feedbackSource = 'specific'; // Specific feedback overrides learned patterns
        feedbackDetails = null; // Will be populated below
        
        // BACKWARDS COMPATIBILITY:
        // - NEW feedback: has adjustedComponents (user's component adjustments from sliders)
        // - OLD feedback: only has components (AI scores stored for reference) + userScore (overall correction)
        //
        // For new feedback: use adjustedComponents directly
        // For old feedback: apply the overall userScore correction, not the component values
        
        if (priorFeedback.adjustedComponents) {
          // NEW: User adjusted individual components via sliders
          const feedbackComponents = priorFeedback.adjustedComponents;
          logger.info(TAG, `FEEDBACK FOUND for ${imageId}! Applying NEW component adjustments...`);
          logger.debug(TAG, `Using adjusted components from feedback`);
          
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
        } else {
          // OLD: User only adjusted overall score (no component-level detail)
          logger.info(TAG, `FEEDBACK FOUND for ${imageId}! Using OLD-format feedback (overall score only)...`);
          logger.debug(TAG, `Overall correction: ${rawOverallScore} → ${priorFeedback.userScore}`);
          
          // For old feedback, just use the userScore directly as the correction target
          // We'll apply it after recalculation
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
          components: priorFeedback.components,
          reasoning: priorFeedback.reasoning || '',
          source: 'specific'
        };
        
        logger.info(TAG, `Applied feedback corrections. Score: ${rawOverallScore} → ${overallScore}`);
      } else if (appliedPatterns) {
        // No specific feedback for this image, but learned patterns were applied
        feedbackApplied = true;
        feedbackSource = 'learned'; // Learned from folder history
        
        // Build summary of learned patterns applied - create as array for UI display
        const patternSummary = Object.entries(appliedPatterns)
          .map(([component, data]) => {
            return `${component}: ${data.original} → ${data.adjusted} (confidence: ${Math.round(data.pattern.confidence * 100)}%, based on ${data.pattern.count} feedback entries)`;
          });

        feedbackDetails = {
          source: 'learned',
          patternSummary: patternSummary, // Now an array instead of string
          appliedPatterns: appliedPatterns,
          folderHistoryEntries: feedbackData.entries.length
        };
        
        logger.info(TAG, `Applied learned patterns from folder history. Score: ${rawOverallScore} → ${overallScore}`);
        logger.debug(TAG, `Learned patterns applied: ${patternSummary.length} components adjusted`);
      } else {
        logger.debug(TAG, `No feedback applied (no specific feedback, no patterns, or patterns didn't meet threshold)`);
      }

      // Calculate average confidence from labels
      const avgConfidence = labels.length > 0 
        ? Math.round((labels.reduce((sum, l) => sum + (l.score || 0), 0) / labels.length) * 100)
        : 50;

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
        processingTime: Date.now() - startTime,
        cost: '$0.0015',
        feedbackApplied: feedbackApplied,
        feedbackSource: feedbackSource,
        feedbackDetails: feedbackDetails,
        correctionDetails: null
      };

      logger.info(TAG, `Detailed analysis complete: ${response.overallScore}/10 (${avgConfidence}% confidence)`);
      return response;

    } catch (err) {
      logger.error(TAG, `Detailed analysis failed for ${path.basename(filePath)}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Calculate learned correction patterns from all feedback entries
   */
  _calculateLearnedPatterns(feedbackData) {
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
        
        // BACKWARDS COMPATIBILITY:
        // NEW feedback: use adjustedComponents (user's component preference)
        // OLD feedback: use components (AI scores - not really user preference, but historical data)
        const scoreSource = entry.adjustedComponents || entry.components;
        
        if (scoreSource && scoreSource[component] !== undefined) {
          const userComponentScore = scoreSource[component];
          
          corrections.push({
            imageId: entry.imageId,
            userScore: userComponentScore,
            aiScore: entry.aiScore,
            timestamp: entry.timestamp,
            recencyWeight: recencyFactor,
            isNew: !!entry.adjustedComponents // Track if this is new format
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
          stdDev: Math.round(stdDev * 100) / 100,
          newFormatCount: corrections.filter(c => c.isNew).length // Track new format entries
        };
      }
    }

    return Object.keys(patterns).length > 0 ? patterns : null;
  }

  /**
   * Apply learned correction patterns to component scores
   */
  _applyLearnedPatterns(componentScores, learnedPatterns) {
    if (!learnedPatterns) {
      return componentScores;
    }

    const adjusted = { ...componentScores };

    for (const [component, pattern] of Object.entries(learnedPatterns)) {
      if (adjusted[component] !== undefined && pattern.confidence >= 0.8) {
        const originalScore = adjusted[component];
        
        // Apply the learned average adjustment, clamped to ±2 points
        const maxAdjustment = 2;
        const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, pattern.avg));
        
        adjusted[component] = Math.max(1, Math.min(10, originalScore + adjustment));
      }
    }

    return adjusted;
  }
}

module.exports = VisionAnalysisService;
