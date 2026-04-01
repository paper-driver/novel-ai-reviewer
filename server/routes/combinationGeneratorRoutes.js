const express = require('express');
const ArtistRegistryService = require('../services/artistRegistryService');
const CombinationGeneratorService = require('../services/combinationGeneratorService');

const router = express.Router();

// Initialize services
const artistRegistryService = new ArtistRegistryService();
const combinationGeneratorService = new CombinationGeneratorService();

/**
 * POST /api/combination-generator/generate
 * Generate artist combinations based on user input
 */
router.post('/generate', (req, res) => {
  try {
    const { folderPath, userInput, maxSuggestions = 5 } = req.body;

    if (!folderPath || !userInput) {
      return res.status(400).json({ 
        success: false, 
        message: 'folderPath and userInput are required' 
      });
    }

    // Load registry
    const artists = artistRegistryService.listArtists(folderPath);

    if (artists.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No artists in registry. Please add artists first.',
        suggestions: ['Create artists in the Artist Registry before generating combinations']
      });
    }

    // Generate combinations
    const result = combinationGeneratorService.generateCombinations(
      artists,
      userInput,
      maxSuggestions
    );

    res.json(result);
  } catch (error) {
    console.error('Error generating combinations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * POST /api/combination-generator/save-combination
 * Save a generated combination for future reference
 */
router.post('/save-combination', (req, res) => {
  try {
    const { combination, name } = req.body;

    if (!combination || !name) {
      return res.status(400).json({ 
        success: false, 
        message: 'combination and name are required' 
      });
    }

    const saved = combinationGeneratorService.saveCombination(combination, name);

    res.status(201).json({
      success: true,
      saved,
      message: `Combination "${name}" saved successfully`
    });
  } catch (error) {
    console.error('Error saving combination:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * GET /api/combination-generator/saved
 * Get all saved combinations
 */
router.get('/saved', (req, res) => {
  try {
    const saved = combinationGeneratorService.getSavedCombinations();

    res.json({
      success: true,
      combinations: saved,
      count: saved.length
    });
  } catch (error) {
    console.error('Error retrieving saved combinations:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * POST /api/combination-generator/format-prompt
 * Format a combination as a Novel AI prompt string
 */
router.post('/format-prompt', (req, res) => {
  try {
    const { combination } = req.body;

    if (!combination) {
      return res.status(400).json({ 
        success: false, 
        message: 'combination is required' 
      });
    }

    const prompt = combinationGeneratorService.formatPrompt(combination);

    res.json({
      success: true,
      prompt,
      format: 'novel-ai',
      example: 'Use this directly in Novel AI prompt field'
    });
  } catch (error) {
    console.error('Error formatting prompt:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
