const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'PromptGrouping';

function createPromptGroupingRoutes(promptGroupingService, imageMetadataService) {
  const router = express.Router();

  /**
   * POST /api/prompt-grouping/load-groups
   * Load and group images by prompt
   */
  router.post('/load-groups', async (req, res) => {
    try {
      const { folderPath, useCache } = req.body;
      const result = await promptGroupingService.loadGroups(folderPath, useCache);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/prompt-grouping/progress
   * Get current progress of grouping operation
   */
  router.get('/progress', (req, res) => {
    try {
      const { folderPath } = req.query;
      const progress = promptGroupingService.getProgress(folderPath);
      res.json(progress);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * POST /api/prompt-grouping/set-nickname
   * Set a nickname for a prompt group
   * Request body: { folderPath, groupId, nickname }
   */
  router.post('/set-nickname', (req, res) => {
    try {
      const { folderPath, groupId, nickname } = req.body;
      
      if (!folderPath || groupId === undefined) {
        return res.status(400).json({ error: 'Missing folderPath or groupId' });
      }

      const resolvedPath = path.resolve(folderPath);
      
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const mappingFile = path.join(resolvedPath, '.prompt-mapping.json');
      let mapping = {
        groups: {},
        promptToGroupId: {},
        groupNicknames: {}
      };

      if (fs.existsSync(mappingFile)) {
        try {
          mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        } catch (err) {
          logger.warn(TAG, `Failed to read mapping file: ${err.message}`);
        }
      }

      // Ensure groupNicknames exists
      if (!mapping.groupNicknames) {
        mapping.groupNicknames = {};
      }

      // Update nickname
      if (nickname && nickname.trim()) {
        mapping.groupNicknames[groupId] = nickname.trim();
      } else {
        delete mapping.groupNicknames[groupId];
      }

      // Save updated mapping
      mapping.lastUpdated = new Date().toISOString();
      fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));

      logger.info(TAG, `Set nickname for group ${groupId}: ${mapping.groupNicknames[groupId] || ''}`);
      res.json({
        success: true,
        groupId: groupId,
        nickname: mapping.groupNicknames[groupId] || ''
      });
    } catch (err) {
      logger.error(TAG, `Error setting nickname: ${err.message}`);
      res.status(500).json({ error: 'Failed to set nickname', details: err.message });
    }
  });

  /**
   * GET /api/prompt-grouping/image
   * Serve image file from prompt group
   */
  router.get('/image', (req, res) => {
    try {
      const { filePath: encodedPath, thumbnail } = req.query;
      const filePath = decodeURIComponent(encodedPath);
      
      if (!filePath || !filePath.endsWith('.png')) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // For thumbnails, serve the complete file with aggressive caching
      // PNG files need to be complete to render, partial files won't display
      // Instead, rely on browser caching and compression to reduce bandwidth
      if (thumbnail === 'true') {
        const imageBuffer = fs.readFileSync(filePath);
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.send(imageBuffer);
        return;
      }

      // For full images, serve the complete file
      const imageBuffer = fs.readFileSync(filePath);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(imageBuffer);
    } catch (err) {
      console.error('[PromptGrouping] Error serving image:', err);
      res.status(500).json({ error: 'Failed to serve image', details: err.message });
    }
  });

  /**
   * GET /api/prompt-grouping/image-metadata
   * Serve image metadata including original prompt and artist tags
   */
  router.get('/image-metadata', (req, res) => {
    try {
      const { filePath: encodedPath } = req.query;
      const filePath = decodeURIComponent(encodedPath);
      
      if (!filePath) {
        return res.status(400).json({ error: 'Missing filePath' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const filename = path.basename(filePath);
      const imageBuffer = fs.readFileSync(filePath);
      const metadata = imageMetadataService.readPNGMetadata(imageBuffer);
      
      let prompt = null;
      
      // Try to read embedded PNG metadata first
      if (metadata.comment) {
        try {
          const commentData = JSON.parse(metadata.comment);
          if (commentData.prompt) {
            prompt = commentData.prompt;
          }
        } catch (e) {
          prompt = metadata.comment;
        }
      }
      
      if (!prompt && metadata.description) {
        prompt = metadata.description;
      }
      
      // Fall back to filename extraction
      if (!prompt) {
        const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
        if (match) {
          prompt = match[1];
        }
      }
      
      const artists = imageMetadataService.extractArtistTags(prompt);
      const normalizedPrompt = imageMetadataService.normalizePrompt(prompt);

      console.log(`[PromptGrouping/image-metadata] Extracted prompt, artists: ${artists.join(', ')}`);

      res.json({
        success: true,
        filename,
        originalPrompt: prompt,
        normalizedPrompt: normalizedPrompt,
        artists,
        generationData: JSON.stringify(metadata, null, 2)
      });
    } catch (err) {
      console.error('[PromptGrouping/image-metadata] Error reading metadata:', err);
      res.status(500).json({ error: 'Failed to read metadata', details: err.message });
    }
  });

  /**
   * POST /api/prompt-grouping/save-ratings
   * Save image ratings for a prompt group to a separate file
   */
  router.post('/save-ratings', (req, res) => {
    try {
      const { folderPath, ratings } = req.body;
      if (!folderPath || !ratings) {
        return res.status(400).json({ error: 'Missing folderPath or ratings' });
      }

      const resolvedPath = path.resolve(folderPath);
      
      // Security: Ensure the path exists and is a directory
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const ratingsFile = path.join(resolvedPath, '.image-ratings.json');
      
      try {
        // MERGE logic: Load existing ratings first, then merge with new ones (prevents data loss)
        let existingRatings = {};
        if (fs.existsSync(ratingsFile)) {
          try {
            existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
            console.log('[PromptGrouping] Loaded existing ratings with', Object.keys(existingRatings).length, 'entries');
          } catch (parseErr) {
            console.warn('[PromptGrouping] Failed to parse existing ratings file, starting fresh:', parseErr.message);
            existingRatings = {};
          }
        }
        
        // Merge: existing + new (new ratings override old ones for same keys)
        const mergedRatings = { ...existingRatings, ...ratings };
        
        console.log('[PromptGrouping] Existing:', Object.keys(existingRatings).length, 'entries');
        console.log('[PromptGrouping] New:', Object.keys(ratings).length, 'entries');
        console.log('[PromptGrouping] Merged:', Object.keys(mergedRatings).length, 'entries');
        
        fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
        console.log('[PromptGrouping] Ratings saved to:', ratingsFile);
        res.json({ 
          success: true, 
          message: 'Ratings saved',
          totalEntries: Object.keys(mergedRatings).length,
          newEntries: Object.keys(ratings).length
        });
      } catch (err) {
        console.error('[PromptGrouping] Failed to save ratings:', err);
        res.status(500).json({ error: 'Failed to save ratings', details: err.message });
      }
    } catch (err) {
      console.error('[PromptGrouping] Error in save-ratings:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /**
   * GET /api/prompt-grouping/load-ratings
   * Load image ratings for a prompt group from file
   */
  router.get('/load-ratings', (req, res) => {
    try {
      const { folderPath } = req.query;
      if (!folderPath) {
        return res.status(400).json({ error: 'Missing folderPath' });
      }

      const resolvedPath = path.resolve(folderPath);
      
      // Security: Ensure the path exists and is a directory
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const ratingsFile = path.join(resolvedPath, '.image-ratings.json');
      
      try {
        if (fs.existsSync(ratingsFile)) {
          const ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
          res.json({ success: true, ratings });
        } else {
          res.json({ success: true, ratings: {} });
        }
      } catch (err) {
        console.error('[PromptGrouping] Failed to load ratings:', err);
        res.status(500).json({ error: 'Failed to load ratings', details: err.message });
      }
    } catch (err) {
      console.error('[PromptGrouping] Error in load-ratings:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  return router;
}

module.exports = createPromptGroupingRoutes;
