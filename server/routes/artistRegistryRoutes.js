const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ArtistRegistryService = require('../services/artistRegistryService');
const ImageAnalysisService = require('../services/imageAnalysisService');

/**
 * Create artist registry routes with injected services
 * @param {VisionAnalysisService} visionAnalysisService - Initialized Vision API service
 * @returns {Router} Express router
 */
function createArtistRegistryRoutes(visionAnalysisService) {
  const router = express.Router();

  // Initialize services with proper dependencies
  const artistRegistryService = new ArtistRegistryService();
  const imageAnalysisService = new ImageAnalysisService(visionAnalysisService);

  // Configure multer for image uploads
  const storage = multer.memoryStorage();
  const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
      const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (validMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WebP allowed.'));
      }
    }
  });

  /**
   * GET /api/artist-registry/list
 * List all artists in registry
 */
router.get('/list', (req, res) => {
  try {
    const { folderPath } = req.query;

    if (!folderPath) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath query parameter required' 
      });
    }

    const artists = artistRegistryService.listArtists(folderPath);

    res.json({
      success: true,
      artists,
      count: artists.length
    });
  } catch (error) {
    console.error('Error listing artists:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * POST /api/artist-registry/add-artist
 * Add new artist to registry
 */
router.post('/add-artist', (req, res) => {
  try {
    const { folderPath, name, artStyle, anatomy, object, colouring, promptInterpretation, description, notes } = req.body;

    if (!folderPath || !name) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath and name are required' 
      });
    }

    const artist = artistRegistryService.addArtist(folderPath, {
      name,
      artStyle,
      anatomy: parseInt(anatomy) || 0,
      object: parseInt(object) || 0,
      colouring: parseInt(colouring) || 0,
      promptInterpretation: parseInt(promptInterpretation) || 0,
      description,
      notes
    });

    res.status(201).json({
      success: true,
      artist,
      message: `Artist "${name}" added to registry`
    });
  } catch (error) {
    console.error('Error adding artist:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * PUT /api/artist-registry/:artistId
 * Update artist metadata (not strength - that's auto-calculated)
 */
router.put('/:artistId', (req, res) => {
  try {
    const { artistId } = req.params;
    const { folderPath, anatomy, object, colouring, promptInterpretation, artStyle, metadata } = req.body;

    if (!folderPath) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath is required' 
      });
    }

    const updateData = {};
    if (anatomy !== undefined) updateData.anatomy = parseInt(anatomy);
    if (object !== undefined) updateData.object = parseInt(object);
    if (colouring !== undefined) updateData.colouring = parseInt(colouring);
    if (promptInterpretation !== undefined) updateData.promptInterpretation = parseInt(promptInterpretation);
    if (artStyle !== undefined) updateData.artStyle = artStyle;
    if (metadata !== undefined) updateData.metadata = metadata;

    const artist = artistRegistryService.updateArtist(folderPath, artistId, updateData);

    res.json({
      success: true,
      artist,
      message: 'Artist updated successfully'
    });
  } catch (error) {
    console.error('Error updating artist:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * DELETE /api/artist-registry/:artistId
 * Delete artist from registry (includes folder deletion)
 */
router.delete('/:artistId', (req, res) => {
  try {
    const { artistId } = req.params;
    const { folderPath } = req.query;

    if (!folderPath) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath query parameter required' 
      });
    }

    artistRegistryService.deleteArtist(folderPath, artistId);

    res.json({
      success: true,
      message: 'Artist deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting artist:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * POST /api/artist-registry/upload-image-pair
 * Upload image pair (baseline + with artist) for analysis
 */
router.post('/upload-image-pair', upload.fields([
  { name: 'baseImage', maxCount: 1 },
  { name: 'withArtistImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { folderPath, artistName } = req.body;

    if (!folderPath || !artistName) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath and artistName are required' 
      });
    }

    if (!req.files || !req.files.baseImage || !req.files.withArtistImage) {
      return res.status(400).json({ 
        success: false, 
        message: 'Both baseImage and withArtistImage are required' 
      });
    }

    // Create artist folder structure if needed
    const artistFolderPath = path.join(folderPath, artistName);
    const baseDirPath = path.join(artistFolderPath, 'base');
    const withArtistDirPath = path.join(artistFolderPath, 'with_artist');

    fs.mkdirSync(baseDirPath, { recursive: true });
    fs.mkdirSync(withArtistDirPath, { recursive: true });

    // Save image files
    const baseFileName = `image_${Date.now()}_0.jpg`;
    const withArtistFileName = `image_${Date.now()}_1.jpg`;

    const baseImagePath = path.join(baseDirPath, baseFileName);
    const withArtistImagePath = path.join(withArtistDirPath, withArtistFileName);

    fs.writeFileSync(baseImagePath, req.files.baseImage[0].buffer);
    fs.writeFileSync(withArtistImagePath, req.files.withArtistImage[0].buffer);

    // Update status to analyzing and return job info
    const artist = artistRegistryService.getArtist(folderPath, req.body.artistId || '');
    
    res.status(202).json({
      success: true,
      jobId: `job_${Date.now()}`,
      status: 'analyzing',
      artistName,
      baseImagePath,
      withArtistImagePath,
      message: 'Image pair received. Analysis starting...',
      estimatedTime: 15000 // ms
    });

    // Run analysis asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const analysisResult = await imageAnalysisService.analyzeImagePair(
          baseImagePath,
          withArtistImagePath,
          artistName
        );

        // Find artist and update strength
        const artists = artistRegistryService.listArtists(folderPath);
        const artist = artists.find(a => a.name === artistName);

        if (artist) {
          artistRegistryService.updateArtistStrength(
            folderPath,
            artist.id,
            analysisResult.lpipsScore,
            analysisResult.googleVisionScore
          );

          // Save image pair metadata
          artistRegistryService.saveImagePairMetadata(folderPath, artistName, {
            baseImage: `base/${baseFileName}`,
            withArtistImage: `with_artist/${withArtistFileName}`,
            lpipsScore: analysisResult.lpipsScore,
            googleVisionScore: analysisResult.googleVisionScore,
            status: 'validated'
          });

          // Broadcast validation complete via WebSocket
          if (global.websocketService) {
            const updatedArtist = artistRegistryService.getArtist(folderPath, artist.id);
            global.websocketService.broadcastValidationComplete(
              artist.id,
              artistName,
              {
                lpipsScore: analysisResult.lpipsScore,
                googleVisionScore: analysisResult.googleVisionScore,
                strength: updatedArtist.strength,
                confidence: updatedArtist.confidence,
                strengthLabel: updatedArtist.strengthLabel
              }
            );
          }
        }
      } catch (analysisError) {
        console.error('Error during async analysis:', analysisError);
        
        // Broadcast error via WebSocket
        if (global.websocketService) {
          global.websocketService.broadcastError(
            req.body.artistId || 'unknown',
            analysisError.message
          );
        }
      }
    });

  } catch (error) {
    console.error('Error uploading image pair:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * GET /api/artist-registry/:artistId/analysis-details
 * Get detailed analysis information for an artist
 */
router.get('/:artistId/analysis-details', (req, res) => {
  try {
    const { artistId } = req.params;
    const { folderPath } = req.query;

    if (!folderPath) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath query parameter required' 
      });
    }

    const details = artistRegistryService.getAnalysisDetails(folderPath, artistId);

    res.json({
      success: true,
      details
    });
  } catch (error) {
    console.error('Error getting analysis details:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * POST /api/artist-registry/generate-combination
 * Generate artist combinations based on user input
 * (Implementation in combinationGeneratorService)
 */
router.post('/generate-combination', (req, res) => {
  try {
    const { folderPath, userInput, maxSuggestions } = req.body;

    if (!folderPath || !userInput) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath and userInput are required' 
      });
    }

    // Return placeholder response - actual generation happens in separate service
    res.json({
      success: true,
      input: userInput,
      suggestions: [],
      message: 'Combination generation endpoint ready'
    });
  } catch (error) {
    console.error('Error generating combinations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

  return router;
}

module.exports = createArtistRegistryRoutes;
