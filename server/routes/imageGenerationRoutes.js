/**
 * Image Generation Routes
 * HTTP endpoints for Novel AI image generation with artist tags
 * Supports background job processing with progress tracking
 * Delegates business logic to NovelAiService
 */

const express = require('express');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const ImageAnalysisService = require('../services/imageAnalysisService');

const TAG = 'ImageGenerationRoutes';

// In-memory job storage (in production, use a database)
const generationJobs = new Map();

function createImageGenerationRoutes(
  novelAiService,
  baseImageManagerService,
  imageMetadataService,
  visionAnalysisService,
  fileSystemService,
  lpipsService,
  artistRegistryService
) {
  const router = express.Router();
  const imageAnalysisService = new ImageAnalysisService(visionAnalysisService);

  /**
   * POST /api/image-generation/generate
   * Trigger image generation for an artist with selected base images
   * Body: {
   *   artistId: string,
   *   artistName: string,
   *   registryFolder: string,
   *   selectedBaseImages: string[],
   *   generationParams?: object (optional parameter overrides)
   * }
   * Response: { success, jobId, estimatedTime }
   */
  router.post('/generate', async (req, res) => {
    try {
      const {
        artistId,
        artistName,
        registryFolder,
        selectedBaseImages,
        generationParams
      } = req.body;

      // Validate required fields
      if (!artistId || !artistName || !registryFolder || !Array.isArray(selectedBaseImages)) {
        return res.status(400).json({
          error: 'artistId, artistName, registryFolder, and selectedBaseImages[] are required'
        });
      }

      if (selectedBaseImages.length === 0) {
        return res.status(400).json({
          error: 'At least one base image must be selected'
        });
      }

      // Create job ID
      const jobId = `job_${artistId}_${Date.now()}`;

      // Initialize job tracking
      const job = {
        jobId,
        artistId,
        artistName,
        registryFolder,
        selectedBaseImages,
        status: 'pending',
        progress: 0,
        currentImage: 0,
        totalImages: selectedBaseImages.length,
        generatedImages: [],
        errors: [],
        startedAt: new Date().toISOString(),
        completedAt: null,
        results: null
      };

      generationJobs.set(jobId, job);

      logger.info(TAG, `Created generation job ${jobId} for artist: ${artistName}`);

      // Start generation in background (don't wait for completion)
      performImageGeneration(
        job,
        novelAiService,
        baseImageManagerService,
        imageMetadataService,
        visionAnalysisService,
        fileSystemService,
        lpipsService,
        artistRegistryService,
        imageAnalysisService,
        generationParams
      ).catch(error => {
        logger.error(TAG, `Background generation failed for ${jobId}: ${error.message}`);
        job.status = 'failed';
        job.errors.push(error.message);
        job.completedAt = new Date().toISOString();
      });

      // Estimate time: ~30 seconds per image + overhead
      const estimatedTime = selectedBaseImages.length * 30 + 10;

      res.json({
        success: true,
        jobId,
        totalImages: selectedBaseImages.length,
        estimatedTime: `${estimatedTime} seconds`
      });
    } catch (err) {
      logger.error(TAG, `Failed to create generation job: ${err.message}`);
      res.status(500).json({
        error: 'Failed to create generation job',
        details: err.message
      });
    }
  });

  /**
   * GET /api/image-generation/status/:jobId
   * Check the status of a generation job
   * Response: { success, status, progress, currentImage, totalImages, estimatedTimeRemaining }
   */
  router.get('/status/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;

      const job = generationJobs.get(jobId);
      if (!job) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      // Calculate estimated time remaining
      let estimatedTimeRemaining = null;
      if (job.status === 'generating') {
        const imagesRemaining = job.totalImages - job.currentImage;
        estimatedTimeRemaining = `${imagesRemaining * 30} seconds`;
      }

      res.json({
        success: true,
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        currentImage: job.currentImage,
        totalImages: job.totalImages,
        estimatedTimeRemaining,
        errors: job.errors
      });
    } catch (err) {
      logger.error(TAG, `Failed to get job status: ${err.message}`);
      res.status(500).json({
        error: 'Failed to get job status',
        details: err.message
      });
    }
  });

  /**
   * GET /api/image-generation/results/:jobId
   * Get the final results of a completed generation job
   * Response: { success, job, results: { generatedImages, strength, confidence } }
   */
  router.get('/results/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;

      const job = generationJobs.get(jobId);
      if (!job) {
        return res.status(404).json({
          error: 'Job not found'
        });
      }

      // Allow completed, completed_with_errors, and failed statuses
      if (job.status !== 'completed' && job.status !== 'completed_with_errors' && job.status !== 'failed') {
        return res.status(400).json({
          error: `Job is still ${job.status}. Check /status endpoint for progress.`
        });
      }

      res.json({
        success: job.status === 'completed',
        jobId: job.jobId,
        status: job.status,
        artistId: job.artistId,
        artistName: job.artistName,
        totalImages: job.totalImages,
        generatedCount: job.generatedImages.length,
        generatedImages: job.generatedImages,
        errors: job.errors,
        completedAt: job.completedAt,
        results: job.results
      });
    } catch (err) {
      logger.error(TAG, `Failed to get job results: ${err.message}`);
      res.status(500).json({
        error: 'Failed to get job results',
        details: err.message
      });
    }
  });

  return router;
}

/**
 * Perform the actual image generation (background task)
 */
async function performImageGeneration(
  job,
  novelAiService,
  baseImageManagerService,
  imageMetadataService,
  visionAnalysisService,
  fileSystemService,
  lpipsService,
  artistRegistryService,
  imageAnalysisService,
  generationParams
) {
  try {
    job.status = 'generating';

    // Create artist folder if needed - use artist name, not ID
    const artistFolderPath = path.join(job.registryFolder, job.artistName);
    fileSystemService.ensureDirectoryExists(artistFolderPath);
    fileSystemService.ensureDirectoryExists(path.join(artistFolderPath, 'base'));
    fileSystemService.ensureDirectoryExists(path.join(artistFolderPath, 'with_artist'));

    // Copy selected base images to artist's base folder for pairing analysis
    logger.info(TAG, `Copying ${job.selectedBaseImages.length} base images to artist folder`);
    for (const baseImageName of job.selectedBaseImages) {
      try {
        const sourceBasePath = baseImageManagerService.getBaseImagePath(
          baseImageName,
          job.registryFolder
        );
        const destBasePath = path.join(artistFolderPath, 'base', baseImageName);
        
        // Copy file if it doesn't already exist
        if (fs.existsSync(sourceBasePath) && !fs.existsSync(destBasePath)) {
          fs.copyFileSync(sourceBasePath, destBasePath);
          logger.info(TAG, `Copied base image: ${baseImageName}`);
        }
      } catch (copyError) {
        logger.warn(TAG, `Failed to copy base image ${baseImageName}: ${copyError.message}`);
      }
    }

    // Process each selected base image
    for (let i = 0; i < job.selectedBaseImages.length; i++) {
      const baseImageName = job.selectedBaseImages[i];
      job.currentImage = i + 1;
      job.progress = Math.round((job.currentImage / job.totalImages) * 100);

      try {
        logger.info(TAG, `Processing image ${job.currentImage}/${job.totalImages}: ${baseImageName}`);

        // Get path to base image
        const baseImagePath = baseImageManagerService.getBaseImagePath(
          baseImageName,
          job.registryFolder
        );

        // Verify base image file exists before processing
        if (!fs.existsSync(baseImagePath)) {
          throw new Error(`Base image file not found at: ${baseImagePath}`);
        }

        // Extract metadata from base image
        const metadata = imageMetadataService.extractMetadata(baseImagePath);

        // Extract basic prompt for Novel AI generation
        const basicPrompt = imageMetadataService.extractBasicPrompt(baseImagePath);

        // Build request payload with artist tag
        const payload = novelAiService.buildPayload(
          metadata,
          job.artistName,
          basicPrompt,
          generationParams
        );

        // Send to Novel AI API
        logger.info(TAG, `Calling Novel AI API for image ${job.currentImage}...`);
        const zipBuffer = await novelAiService.makeGenerationRequest(payload);

        // Extract PNG from ZIP
        const imageBuffer = await novelAiService.extractImageFromZip(zipBuffer);

        // Save generated image
        const savedPath = await novelAiService.saveGeneratedImage(
          imageBuffer,
          artistFolderPath,
          'with_artist',
          metadata
        );

        // Analyze image pair with both Vision and LPIPS in parallel
        let lpipsScore = null;
        let googleVisionScore = null;
        let lpipsInterpretation = '';
        try {
          logger.info(TAG, `Analyzing image pair (Vision + LPIPS): ${baseImageName} <-> ${path.basename(savedPath)}`);
          const analysisResult = await imageAnalysisService.analyzeImagePair(baseImagePath, savedPath, job.artistName);
          
          // Get LPIPS score (normalized to 0-1 from imageAnalysisService)
          lpipsScore = analysisResult.lpipsScore;
          logger.info(TAG, `LPIPS score computed: ${lpipsScore.toFixed(3)} (0-1 normalized)`);
          
          // Get Vision comparison score (normalized to 0-1 from imageAnalysisService)
          googleVisionScore = analysisResult.googleVisionScore;
          logger.info(TAG, `Vision comparison score: ${googleVisionScore.toFixed(3)} (0-1 normalized)`);
          
          // Provide LPIPS interpretation
          if (lpipsScore < 0.2) {
            lpipsInterpretation = 'Very similar - artist barely changed the image';
          } else if (lpipsScore < 0.4) {
            lpipsInterpretation = 'Similar - artist made subtle style changes';
          } else if (lpipsScore < 0.6) {
            lpipsInterpretation = 'Moderate difference - artist applied noticeable changes';
          } else if (lpipsScore < 0.8) {
            lpipsInterpretation = 'Different - artist significantly transformed the image';
          } else {
            lpipsInterpretation = 'Very different - artist completely changed the image';
          }
        } catch (analysisError) {
          logger.error(TAG, `Image pair analysis failed: ${analysisError.message}`);
          lpipsScore = null;
          googleVisionScore = null;
          lpipsInterpretation = 'Analysis failed';
        }

        // Create comprehensive analysis result
        const analysisResult = {
          googleVisionScore: googleVisionScore, // 0-0.4 range for artist registry
          lpipsScore: lpipsScore,
          lpipsInterpretation: lpipsInterpretation,
          strength: calculateStrength(googleVisionScore, lpipsScore)
        };

        job.generatedImages.push({
          filename: path.basename(savedPath),
          path: savedPath,
          size: imageBuffer.length,
          baseImage: baseImageName,
          baseImagePath: baseImagePath,
          analysisResult: analysisResult,
          generatedAt: new Date().toISOString()
        });

        logger.info(TAG, `Successfully generated and analyzed image ${job.currentImage}/${job.totalImages}`);
      } catch (imageError) {
        logger.error(TAG, `Error generating image for ${baseImageName}: ${imageError.message}`);
        job.errors.push({
          baseImage: baseImageName,
          error: imageError.message
        });
      }
    }

    // Calculate overall results with Vision + LPIPS hybrid scoring
    const allAnalysisResults = job.generatedImages.map(img => img.analysisResult);
    
    const googleVisionScores = allAnalysisResults
      .filter(a => typeof a?.googleVisionScore === 'number')
      .map(a => a.googleVisionScore);
    
    const lpipsScores = allAnalysisResults
      .filter(a => typeof a?.lpipsScore === 'number')
      .map(a => a.lpipsScore);

    const avgGoogleVision = googleVisionScores.length > 0
      ? (googleVisionScores.reduce((a, b) => a + b, 0) / googleVisionScores.length).toFixed(3)
      : null;
    
    const avgLpips = lpipsScores.length > 0
      ? (lpipsScores.reduce((a, b) => a + b, 0) / lpipsScores.length).toFixed(3)
      : null;

    // Hybrid strength: Vision (0-1) × 0.33 + LPIPS (0-1) × 0.67
    let hybridStrength = null;
    if (avgGoogleVision !== null && avgLpips !== null) {
      const visionScore = parseFloat(avgGoogleVision);
      const lpipsScore = parseFloat(avgLpips);
      hybridStrength = (visionScore * 0.33 + lpipsScore * 0.67).toFixed(2);
    }

    job.results = {
      totalGenerated: job.generatedImages.length,
      totalFailed: job.errors.length,
      visionAnalysis: {
        averageGoogleVisionScore: avgGoogleVision,
        count: googleVisionScores.length
      },
      lpipsAnalysis: {
        averageSimilarity: avgLpips,
        count: lpipsScores.length
      },
      strength: hybridStrength,
      confidence: job.generatedImages.length === job.totalImages ? 'high' : 'medium'
    };

    job.status = job.errors.length === 0 ? 'completed' : 'completed_with_errors';
    job.completedAt = new Date().toISOString();

    // Persist analysis results to artist registry metadata
    logger.info(TAG, `Saving analysis results to artist registry metadata...`);
    try {
      for (const generatedImage of job.generatedImages) {
        if (generatedImage.analysisResult) {
          const lpipsScore = generatedImage.analysisResult.lpipsScore;
          const googleVisionScore = generatedImage.analysisResult.googleVisionScore;
          
          artistRegistryService.saveImagePairMetadata(
            job.registryFolder,
            job.artistName,
            {
              baseImage: generatedImage.baseImage,
              withArtistImage: path.relative(
                path.join(job.registryFolder, job.artistName),
                generatedImage.path
              ),
              lpipsScore: lpipsScore,
              googleVisionScore: googleVisionScore,
              analysisDetails: {
                lpipsScore: lpipsScore,
                lpipsInterpretation: generatedImage.analysisResult.lpipsInterpretation,
                strength: generatedImage.analysisResult.strength
              },
              status: 'analyzed'
            }
          );
          
          // Also update the artist record with the scores
          logger.info(TAG, `Updating artist record with scores: LPIPS=${lpipsScore}, Vision=${googleVisionScore}`);
          artistRegistryService.updateArtistStrength(
            job.registryFolder,
            job.artistId,
            lpipsScore || 0,
            googleVisionScore || 0
          );
        }
      }
      logger.info(TAG, `Analysis results saved to artist registry`);
    } catch (saveError) {
      logger.error(TAG, `Failed to persist analysis results: ${saveError.message}`);
    }

    logger.info(TAG, `Generation job ${job.jobId} completed: ${job.generatedImages.length}/${job.totalImages} images`);
  } catch (error) {
    logger.error(TAG, `Fatal error in image generation: ${error.message}`);
    job.status = 'failed';
    job.errors.push(error.message);
    job.completedAt = new Date().toISOString();
  }
}

/**
 * Calculate strength score from Vision and LPIPS analysis
 * Scores from imageAnalysisService are 0-1 normalized
 * Uses: (Vision × 0.33) + (LPIPS × 0.67)
 * Result: 0-1 normalized strength value
 */
function calculateStrength(googleVisionScore, lpipsScore) {
  try {
    if (typeof googleVisionScore !== 'number' || typeof lpipsScore !== 'number') {
      return null;
    }

    // Hybrid: Vision × 0.33 + LPIPS × 0.67
    // Both scores are already 0-1 normalized from imageAnalysisService
    return +(googleVisionScore * 0.33 + lpipsScore * 0.67).toFixed(2);
  } catch (error) {
    logger.warn(TAG, `Error calculating strength: ${error.message}`);
    return null;
  }
}

module.exports = createImageGenerationRoutes;
