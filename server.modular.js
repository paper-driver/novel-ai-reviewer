const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const vision = require('@google-cloud/vision');

// Import logger utility
const logger = require('./server/utils/logger');

// Import all services
const ReviewsService = require('./server/services/reviewsService');
const FileSystemService = require('./server/services/fileSystemService');
const ImageMetadataService = require('./server/services/imageMetadataService');
const ImageServingService = require('./server/services/imageServingService');
const VisionAnalysisService = require('./server/services/visionAnalysisService');
const FolderOperationsService = require('./server/services/folderOperationsService');
const ArtistGalleryService = require('./server/services/artistGalleryService');
const PromptGroupingService = require('./server/services/promptGroupingService');
const BatchRatingService = require('./server/services/batchRatingService');
const FeedbackService = require('./server/services/feedbackService');
const RatingsService = require('./server/services/ratingsService');
const LegacyArtistGroupingService = require('./server/services/legacyArtistGroupingService');

// Import all route creators
const createReviewsRoutes = require('./server/routes/reviewsRoutes');
const createImageMetadataRoutes = require('./server/routes/imageMetadataRoutes');
const createImageServingRoutes = require('./server/routes/imageServingRoutes');
const createVisionAnalysisRoutes = require('./server/routes/visionAnalysisRoutes');
const createFolderOperationsRoutes = require('./server/routes/folderOperationsRoutes');
const createArtistGalleryRoutes = require('./server/routes/artistGalleryRoutes');
const createPromptGroupingRoutes = require('./server/routes/promptGroupingRoutes');
const createBatchRatingRoutes = require('./server/routes/batchRatingRoutes');
const createRatingsRoutes = require('./server/routes/ratingsRoutes');
const createFeedbackRoutes = require('./server/routes/feedbackRoutes');
const createLegacyGroupingRoutes = require('./server/routes/legacyGroupingRoutes');

// Initialize Express app
const app = express();
const PORT = 3000;

// ===== CONFIGURATION =====
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'google-vision-credentials.json');
const visionClient = new vision.ImageAnnotatorClient();

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
const GENERATED_DIR = path.join(__dirname, 'generated');

// ===== MULTER STORAGE CONFIGURATION =====
// Helper function to read reviews (needed for multer)
const readReviews = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    logger.error('Server', `Failed to read reviews file: ${err.message}`);
    return [];
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine the folder based on the next review ID
    const reviews = readReviews();
    const nextId = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    const folderPath = path.join(GENERATED_DIR, String(nextId));
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    // Save folder name on request object so we can use it later
    req.generatedFolder = String(nextId);
    cb(null, folderPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== INITIALIZE SERVICES =====
const fileSystemService = new FileSystemService(logger);
const reviewsService = new ReviewsService(DATA_FILE);
const imageMetadataService = new ImageMetadataService(logger);
const imageServingService = new ImageServingService(GENERATED_DIR);
const visionAnalysisService = new VisionAnalysisService(visionClient, logger);
const folderOperationsService = new FolderOperationsService(logger);
const feedbackService = new FeedbackService(logger);
const artistGalleryService = new ArtistGalleryService(logger);
const promptGroupingService = new PromptGroupingService(folderOperationsService, imageMetadataService);
const batchRatingService = new BatchRatingService(visionAnalysisService, feedbackService, logger);
const ratingsService = new RatingsService(logger);
const legacyArtistGroupingService = new LegacyArtistGroupingService(imageMetadataService, feedbackService, logger);

// ===== ENSURE REQUIRED DIRECTORIES =====
fileSystemService.ensureDirectoryExists(GENERATED_DIR);
fileSystemService.ensureDirectoryExists(DATA_DIR);

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

// ===== MOUNT ROUTES =====

// Reviews endpoints
app.use('/api/reviews', createReviewsRoutes(reviewsService, upload));

// Image metadata endpoints
app.use('/api/image-metadata', createImageMetadataRoutes(imageMetadataService));

// Image serving endpoints
app.use('/api/images', createImageServingRoutes(imageServingService));

// Vision analysis endpoints
app.use('/api', createVisionAnalysisRoutes(visionAnalysisService, feedbackService));

// Folder operations endpoints
app.use('/api', createFolderOperationsRoutes(folderOperationsService));

// Artist gallery endpoints
app.use('/api/artist-gallery', createArtistGalleryRoutes(artistGalleryService, imageMetadataService, imageServingService));

// Prompt grouping endpoints
app.use('/api/prompt-grouping', createPromptGroupingRoutes(promptGroupingService, imageMetadataService));

// Batch rating endpoints
app.use('/api/batch-rating', createBatchRatingRoutes(batchRatingService));

// Ratings endpoints
app.use('/api/ratings', createRatingsRoutes(ratingsService));

// Feedback endpoints
app.use('/api/feedback', createFeedbackRoutes(feedbackService));

// Legacy grouping endpoints (backward compatibility)
app.use('/api', createLegacyGroupingRoutes(legacyArtistGroupingService, GENERATED_DIR, logger));

// Background job processor - process batch jobs asynchronously
const processBackgroundJobs = async () => {
  setInterval(async () => {
    const jobs = batchRatingService.getAllJobs();
    for (const job of jobs) {
      if (job.status === 'pending') {
        try {
          await batchRatingService.processBatchJob(job.jobId);
        } catch (err) {
          logger.error('BatchProcessor', `Error processing job ${job.jobId}: ${err.message}`);
        }
      }
    }
  }, 5000); // Check every 5 seconds for pending jobs
};

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  logger.error('Server', `Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  logger.info('Server', `API Server listening on port ${PORT}`);
  logger.info('Server', `Health check available at http://localhost:${PORT}/health`);
  processBackgroundJobs();
});

module.exports = app;
