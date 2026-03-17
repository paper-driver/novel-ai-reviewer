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

  submitBatchJob(folderPath, imageFilenames) {
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

          let score = null;
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount < maxRetries && score === null) {
            try {
              score = await this.visionAnalysisService.analyzeImageQuality(filePath);
              this.logger.debug('BatchRating', `Got score for ${filename}: ${score}`);
            } catch (apiErr) {
              retryCount++;
              this.logger.error('BatchRating', `Vision API error (attempt ${retryCount}/${maxRetries}) for ${filename}: ${apiErr.message}`);

              if (retryCount < maxRetries) {
                const backoffDelay = Math.pow(2, retryCount - 1) * 1000;
                this.logger.debug('BatchRating', `Retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
              } else {
                this.logger.warn('BatchRating', `Max retries exceeded for ${filename}, using fallback score`);
                score = Math.floor(Math.random() * 5) + 5;
              }
            }
          }

          const rawScore = score;
          let finalScore = score;

          const feedbackData = this.feedbackService.loadFeedback(job.folderPath);
          this.logger.debug('BatchRating', `Learning patterns from ${feedbackData.entries.length} feedback entries for ${filename}...`);

          const learnedPatterns = this._calculateLearnedPatterns(feedbackData);

          if (learnedPatterns) {
            finalScore = this._applyLearnedPatterns(filename, learnedPatterns, rawScore);
            this.logger.info('BatchRating', `Applied learned patterns for ${filename}: ${rawScore} -> ${finalScore}`);
          }

          const priorFeedback = feedbackData.entries.find(e => e.imageId === filename);

          if (priorFeedback && priorFeedback.components) {
            finalScore = this._applySpecificFeedback(filename, priorFeedback, finalScore);
            this.logger.info('BatchRating', `Applied specific feedback for ${filename}: ${rawScore} -> ${finalScore}`);
          }

          job.results[filename] = finalScore;
          this.logger.debug('BatchRating', `Stored result - filename: ${filename}, score: ${finalScore}`);
          this.logger.debug('BatchRating', `job.results keys after storing: ${Object.keys(job.results).join(', ')}`);

          job.processedImages++;
          this.logger.info('BatchRating', `Processed ${filename}: ${finalScore}/10`);

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

  _calculateLearnedPatterns(feedbackData) {
    if (!feedbackData.entries || feedbackData.entries.length === 0) {
      return null;
    }

    const patterns = {};
    const components = ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence'];

    for (const component of components) {
      const values = feedbackData.entries
        .filter(e => e.components && e.components[component] !== undefined)
        .map(e => e.components[component]);

      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        patterns[component] = {
          avg: avg - 6,
          confidence: Math.min(1, values.length / 10)
        };
      }
    }

    return Object.keys(patterns).length > 0 ? patterns : null;
  }

  _applyLearnedPatterns(filename, learnedPatterns, baseScore) {
    let anatomy = 6, pose = 6, face = 6, background = 6, objects = 6, coherence = 6;

    const isIllustration = filename.toLowerCase().includes('anime') ||
      filename.toLowerCase().includes('illustration') ||
      filename.toLowerCase().includes('drawing');

    for (const [component, pattern] of Object.entries(learnedPatterns)) {
      if (pattern.confidence >= 0.6) {
        const baseComponentScore = component === 'anatomy' ? anatomy :
          component === 'pose' ? pose :
          component === 'face' ? face :
          component === 'background' ? background :
          component === 'objects' ? objects :
          coherence;

        const maxAdjustment = 2;
        const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, pattern.avg));
        const adjustedScore = Math.max(1, Math.min(10, baseComponentScore + adjustment));

        if (component === 'anatomy') anatomy = adjustedScore;
        else if (component === 'pose') pose = adjustedScore;
        else if (component === 'face') face = adjustedScore;
        else if (component === 'background') background = adjustedScore;
        else if (component === 'objects') objects = adjustedScore;
        else if (component === 'coherence') coherence = adjustedScore;
      }
    }

    let patternScore;
    if (isIllustration) {
      patternScore = Math.round(
        (anatomy * 0.15 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.20 + coherence * 0.15)
      );
    } else {
      patternScore = Math.round(
        (anatomy * 0.20 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.15 + coherence * 0.15)
      );
    }

    return patternScore;
  }

  _applySpecificFeedback(filename, priorFeedback, currentScore) {
    let anatomy = priorFeedback.components.anatomy || 6;
    let pose = priorFeedback.components.pose || 6;
    let face = priorFeedback.components.face || 6;
    let background = priorFeedback.components.background || 6;
    let objects = priorFeedback.components.objects || 6;
    let coherence = priorFeedback.components.coherence || 6;

    const labels = priorFeedback.detectedLabels || [];
    const labelNames = labels.map(l => l.toLowerCase ? l.toLowerCase() : l);
    const isIllustration = labelNames.some(l =>
      l.includes('anime') || l.includes('illustration') || l.includes('drawing') ||
      l.includes('art') || l.includes('cartoon') || l.includes('painting')
    );

    let feedbackScore;
    if (isIllustration) {
      feedbackScore = Math.round(
        (anatomy * 0.15 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.20 + coherence * 0.15)
      );
    } else {
      feedbackScore = Math.round(
        (anatomy * 0.20 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.15 + coherence * 0.15)
      );
    }

    return feedbackScore;
  }
}

module.exports = BatchRatingService;
