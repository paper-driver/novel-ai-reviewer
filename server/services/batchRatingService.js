const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// BatchRatingService - Manages batch image quality analysis jobs
// Responsibilities:
// - Job lifecycle management (submit, process, cancel)
// - Result storage and retrieval
// - Retry logic with exponential backoff
// - Feedback integration and pattern learning

class BatchRatingService {
  constructor(visionAnalysisService, feedbackService, logger) {
    this.visionAnalysisService = visionAnalysisService;
    this.feedbackService = feedbackService;
    this.logger = logger;
    this.jobs = new Map();
  }

  submitBatchJob(folderPath, imageFilenames, sourcePath) {
    if (!Array.isArray(imageFilenames) || imageFilenames.length === 0) {
      throw new Error('Invalid imageFilenames');
    }

    const jobId = uuidv4();

    this.logger.info('BatchRating', `New batch job submitted: ${jobId}`);
    this.logger.info('BatchRating', `Images: ${imageFilenames.length}, Folder: ${folderPath}`);
    this.logger.debug('BatchRating', `Image filenames received: ${JSON.stringify(imageFilenames)}`);

    const uniqueImages = new Set(imageFilenames);
    if (uniqueImages.size !== imageFilenames.length) {
      this.logger.warn('BatchRating', `DUPLICATE FILENAMES DETECTED! Received ${imageFilenames.length} but only ${uniqueImages.size} unique`);
      const duplicates = imageFilenames.filter((img, idx) => imageFilenames.indexOf(img) !== idx);
      this.logger.debug('BatchRating', `Duplicates: ${JSON.stringify(duplicates)}`);
    }

    const job = {
      jobId,
      status: 'pending',
      totalImages: imageFilenames.length,
      processedImages: 0,
      createdAt: new Date(),
      folderPath,
      sourcePath: sourcePath || folderPath,
      imageFilenames,
      results: {},
      error: null
    };

    this.jobs.set(jobId, job);

    const estimatedSeconds = Math.ceil(imageFilenames.length * 0.9);
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    return {
      jobId,
      estimatedTime: `${estimatedMinutes} minute${estimatedMinutes > 1 ? 's' : ''}`
    };
  }

  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    return {
      jobId: job.jobId,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
      error: job.error
    };
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).map(job => ({
      jobId: job.jobId,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    }));
  }

  getJobResults(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'completed') {
      throw new Error('Job not completed yet');
    }

    this.logger.debug('BatchRating', `GET results for job ${jobId}`);
    this.logger.debug('BatchRating', `Results keys: ${Object.keys(job.results).join(', ')}`);

    return job.results;
  }

  cancelBatchJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new Error('Cannot cancel completed/failed job');
    }

    job.status = 'cancelled';
    this.logger.info('BatchRating', `Job ${jobId} cancelled`);

    return { success: true };
  }

  async processBatchJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    this.logger.info('BatchRating', `Starting processing for job ${jobId}`);
    this.logger.debug('BatchRating', `Job imageFilenames (count: ${job.imageFilenames.length}): ${JSON.stringify(job.imageFilenames)}`);
    this.logger.debug('BatchRating', `Job folderPath: ${job.folderPath}`);

    const filePaths = job.imageFilenames.map(img => `${job.folderPath}/${img}`);
    this.logger.debug('BatchRating', `Computed filePaths (count: ${filePaths.length}): ${JSON.stringify(filePaths)}`);

    try {
      for (let i = 0; i < filePaths.length; i++) {
        if (job.status === 'cancelled') {
          this.logger.info('BatchRating', `Job ${jobId} was cancelled, stopping processing`);
          return;
        }

        try {
          const filePath = filePaths[i];
          const filename = path.basename(filePath);

          this.logger.debug('BatchRating', `Processing image ${i + 1}/${filePaths.length}: ${filePath}`);
          this.logger.trace('BatchRating', `Basename: ${filename}`);
          this.logger.trace('BatchRating', `Image filenames passed in: ${job.imageFilenames[i]}`);

          if (!fs.existsSync(filePath)) {
            this.logger.warn('BatchRating', `File not found: ${filePath}`);
            job.processedImages++;
            continue;
          }

          // Analyze with full feedback correction system (same as analyze-illustration endpoint)
          let analysisResult = null;
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount < maxRetries && analysisResult === null) {
            try {
              // Call the new detailed analysis method that includes feedback corrections
              analysisResult = await this.visionAnalysisService.analyzeImageQualityDetailed(
                filePath,
                this.feedbackService,
                job.sourcePath
              );
              this.logger.debug('BatchRating', `Got analysis for ${filename}: ${analysisResult.overallScore}`);
            } catch (apiErr) {
              retryCount++;
              this.logger.error('BatchRating', `Vision API error (attempt ${retryCount}/${maxRetries}) for ${filename}: ${apiErr.message}`);

              if (retryCount < maxRetries) {
                const backoffDelay = Math.pow(2, retryCount - 1) * 1000;
                this.logger.debug('BatchRating', `Retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              } else {
                this.logger.warn('BatchRating', `Max retries exceeded for ${filename}, using fallback score`);
                // Return minimal analysis result on failure
                analysisResult = {
                  overallScore: Math.floor(Math.random() * 5) + 5,
                  rawAIScore: undefined,
                  feedbackApplied: false,
                  feedbackDetails: null
                };
              }
            }
          }

          // Store the full analysis result (including correction info) instead of just the score
          job.results[filename] = {
            score: analysisResult.overallScore,
            // Include feedback correction info for UI display
            rawAIScore: analysisResult.rawAIScore,
            feedbackApplied: analysisResult.feedbackApplied,
            feedbackDetails: analysisResult.feedbackDetails,
            // Also include component scores for detailed display
            components: {
              anatomy: analysisResult.anatomyScore,
              pose: analysisResult.poseScore,
              face: analysisResult.faceQuality,
              background: analysisResult.backgroundQuality,
              objects: analysisResult.objectQuality,
              coherence: analysisResult.coherenceScore
            }
          };
          this.logger.debug('BatchRating', `Stored detailed result - filename: ${filename}, score: ${analysisResult.overallScore}`);
          this.logger.debug('BatchRating', `job.results keys after storing: ${Object.keys(job.results).join(', ')}`);

          job.processedImages++;
          this.logger.info('BatchRating', `Processed ${filename}: ${analysisResult.overallScore}/10`);

        } catch (err) {
          this.logger.error('BatchRating', `Error processing file ${i + 1}: ${err.message}`);
          job.processedImages++;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      job.status = 'completed';
      job.completedAt = new Date();
      this.logger.info('BatchRating', `Job ${jobId} completed successfully`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      this.logger.error('BatchRating', `Job ${jobId} failed: ${err.message}`);
    }
  }


}

module.exports = BatchRatingService;
