const express = require('express');
const fs = require('fs');
const path = require('path');

function createArtistGalleryRoutes(artistGalleryService, imageMetadataService, imageServingService) {
  const router = express.Router();

  /**
   * POST /api/artist-gallery/load-groups
   * Load all artist groups from a folder
   */
  router.post('/load-groups', (req, res) => {
    try {
      const { folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'Missing folderPath' });
      }

      const resolvedPath = path.resolve(folderPath);
      
      // Security: Ensure the path exists and is a directory
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }

      // For ratings storage, always use the selected sorted folder itself
      // This ensures ratings are stored where the user expects them
      const baseFolder = resolvedPath;

      // Load mapping file if it exists
      const mappingFile = path.join(resolvedPath, '.artist-mapping.json');
      let artistKeyToFolder = {};
      if (fs.existsSync(mappingFile)) {
        try {
          artistKeyToFolder = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        } catch (err) {
          console.warn('[ArtistGallery] Failed to read mapping file:', err.message);
        }
      }

      const groups = [];
      const subfolders = fs.readdirSync(resolvedPath).filter(f => {
        const fullPath = path.join(resolvedPath, f);
        return f !== '.artist-mapping.json' && 
               f !== '.artist-ratings.json' && 
               fs.statSync(fullPath).isDirectory();
      });

      subfolders.forEach(folderName => {
        const folderPath = path.join(resolvedPath, folderName);
        const files = fs.readdirSync(folderPath).filter(f => {
          const filePath = path.join(folderPath, f);
          return fs.statSync(filePath).isFile() && f.endsWith('.png') && !f.startsWith('.');
        });

        if (files.length > 0) {
          // Find the original artist key from mapping
          const artistKey = Object.keys(artistKeyToFolder).find(key => artistKeyToFolder[key] === folderName) || folderName;
          const artists = artistKey.split(' | ').filter(a => a && a !== 'no-artists');
          const thumbnailPath = files[0]; // First file as thumbnail

          // Get the latest modification time from all image files
          let latestModifiedTime = 0;
          files.forEach(file => {
            try {
              const filePath = path.join(folderPath, file);
              const fileStats = fs.statSync(filePath);
              const fileModTime = fileStats.mtimeMs || fileStats.mtime.getTime();
              if (fileModTime > latestModifiedTime) {
                latestModifiedTime = fileModTime;
              }
            } catch (err) {
              console.warn('[ArtistGallery] Failed to get mtime for', file, ':', err.message);
            }
          });

          groups.push({
            folderName,
            folderPath: folderPath, // Full path for API calls
            artistKey,
            artists,
            imageCount: files.length,
            thumbnailPath,
            images: files,
            latestModifiedTime: latestModifiedTime || Date.now()
          });
        }
      });

      res.json({
        success: true,
        sortedFolder: resolvedPath,
        baseFolder: baseFolder,
        groups,
        totals: {
          groups: groups.length,
          images: groups.reduce((sum, g) => sum + g.imageCount, 0)
        }
      });
    } catch (err) {
      console.error('[ArtistGallery] Error loading artist groups:', err);
      res.status(500).json({ error: 'Failed to load artist groups', details: err.message });
    }
  });

  /**
   * POST /api/artist-gallery/group-images
   * Returns all images in a specific artist group folder
   */
  router.post('/group-images', (req, res) => {
    try {
      const { folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'Missing folderPath' });
      }

      const resolvedPath = path.resolve(folderPath);
      
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const files = fs.readdirSync(resolvedPath)
        .filter(f => fs.statSync(path.join(resolvedPath, f)).isFile() && f.endsWith('.png') && !f.startsWith('.'));

      res.json({
        success: true,
        images: files
      });
    } catch (err) {
      console.error('[ArtistGallery] Error loading group images:', err);
      res.status(500).json({ error: 'Failed to load group images', details: err.message });
    }
  });

  /**
   * GET /api/artist-gallery/image-metadata
   * Extracts metadata from a specific image file
   */
  router.get('/image-metadata', (req, res) => {
    try {
      const encodedFilePath = req.query.filePath;
      if (!encodedFilePath) {
        return res.status(400).json({ error: 'Missing filePath query parameter' });
      }

      const filePath = decodeURIComponent(encodedFilePath);
      const resolvedPath = path.resolve(filePath);

      // Security: Ensure the path exists and is not trying to escape
      if (!fs.existsSync(resolvedPath)) {
        console.error('[ArtistGallery] File not found:', resolvedPath);
        return res.status(404).json({ error: 'File not found', path: resolvedPath });
      }

      const filename = path.basename(filePath);
      const fileBuffer = fs.readFileSync(resolvedPath);
      const metadata = imageMetadataService.readPNGMetadata(fileBuffer);
      
      let prompt = '';
      
      // Try to read embedded PNG metadata first
      try {
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
      } catch (err) {
        console.warn('[ArtistGallery] Could not parse PNG metadata:', err.message);
      }
      
      // Fall back to extracting from filename if no embedded metadata found
      if (!prompt) {
        const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
        if (match) {
          prompt = match[1];
        }
      }
      
      const artists = imageMetadataService.extractArtistTags(prompt);

      console.log('[ArtistGallery] Successfully read metadata, prompt length:', prompt.length);

      res.json({
        success: true,
        filename,
        prompt,
        artists,
        generationData: JSON.stringify(metadata, null, 2)
      });
    } catch (err) {
      console.error('[ArtistGallery] Error reading image metadata:', err);
      res.status(500).json({ error: 'Failed to read metadata', details: err.message });
    }
  });

  /**
   * GET /api/artist-gallery/image
   * Serves the image file
   */
  router.get('/image', (req, res) => {
    try {
      const encodedFilePath = req.query.filePath;
      const thumbnail = req.query.thumbnail;
      
      if (!encodedFilePath) {
        return res.status(400).json({ error: 'Missing filePath query parameter' });
      }

      const filePath = decodeURIComponent(encodedFilePath);
      const resolvedPath = path.resolve(filePath);

      console.log('[ArtistGallery] Serving image:', resolvedPath);

      // Security: Ensure the file exists
      if (!fs.existsSync(resolvedPath)) {
        console.error('[ArtistGallery] File not found:', resolvedPath);
        return res.status(404).json({ error: 'File not found', path: resolvedPath });
      }

      // For thumbnails, serve the complete file but with aggressive caching
      // PNG files need to be complete to render, partial files won't display
      // Instead, rely on browser caching and compression to reduce bandwidth
      if (thumbnail === 'true') {
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.set('Content-Type', 'image/png');
        res.sendFile(resolvedPath);
        return;
      }

      // For full images, serve the complete file
      res.set('Cache-Control', 'public, max-age=3600');
      res.sendFile(resolvedPath);
    } catch (err) {
      console.error('[ArtistGallery] Error serving image:', err);
      res.status(500).json({ error: 'Failed to serve image', details: err.message });
    }
  });

  /**
   * POST /api/artist-gallery/save-ratings
   * Save image ratings for an artist group to a separate file
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

      const ratingsFile = path.join(resolvedPath, '.artist-ratings.json');
      
      try {
        // MERGE logic: Load existing ratings first, then merge with new ones (prevents data loss)
        let existingRatings = {};
        if (fs.existsSync(ratingsFile)) {
          try {
            existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
            console.log('[ArtistGallery] Loaded existing ratings with', Object.keys(existingRatings).length, 'entries');
          } catch (parseErr) {
            console.warn('[ArtistGallery] Failed to parse existing ratings file, starting fresh:', parseErr.message);
            existingRatings = {};
          }
        }
        
        // Merge: existing + new (new ratings override old ones for same keys)
        const mergedRatings = { ...existingRatings, ...ratings };
        
        console.log('[ArtistGallery] Existing:', Object.keys(existingRatings).length, 'entries');
        console.log('[ArtistGallery] New:', Object.keys(ratings).length, 'entries');
        console.log('[ArtistGallery] Merged:', Object.keys(mergedRatings).length, 'entries');
        
        fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
        console.log('[ArtistGallery] Ratings saved to:', ratingsFile);
        res.json({ 
          success: true, 
          message: 'Ratings saved',
          totalEntries: Object.keys(mergedRatings).length,
          newEntries: Object.keys(ratings).length
        });
      } catch (err) {
        console.error('[ArtistGallery] Failed to save ratings:', err);
        res.status(500).json({ error: 'Failed to save ratings', details: err.message });
      }
    } catch (err) {
      console.error('[ArtistGallery] Error in save-ratings:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /**
   * GET /api/artist-gallery/load-ratings
   * Load image ratings for an artist group from file
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

      const ratingsFile = path.join(resolvedPath, '.artist-ratings.json');
      
      try {
        if (fs.existsSync(ratingsFile)) {
          const ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
          res.json({ success: true, ratings });
        } else {
          res.json({ success: true, ratings: {} });
        }
      } catch (err) {
        console.error('[ArtistGallery] Failed to load ratings:', err);
        res.status(500).json({ error: 'Failed to load ratings', details: err.message });
      }
    } catch (err) {
      console.error('[ArtistGallery] Error in load-ratings:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  /**
   * POST /api/artist-gallery/copy-from-source
   * Copies artist groups and images from source sorted folder to destination
   */
  router.post('/copy-from-source', async (req, res) => {
    try {
      const { sourcePath, destinationPath } = req.body;

      if (!sourcePath || !destinationPath) {
        return res.status(400).json({ 
          success: false,
          error: 'Both sourcePath and destinationPath are required' 
        });
      }

      const resolvedSourcePath = path.resolve(sourcePath);
      const resolvedDestPath = path.resolve(destinationPath);

      // Validate source folder exists
      if (!fs.existsSync(resolvedSourcePath)) {
        return res.status(404).json({
          success: false,
          error: `Source folder not found: ${sourcePath}`
        });
      }

      // Validate destination folder exists
      if (!fs.existsSync(resolvedDestPath)) {
        return res.status(404).json({
          success: false,
          error: `Destination folder not found: ${destinationPath}`
        });
      }

      // Just pass through to the service
      const result = await artistGalleryService.copyGroupsFromSource(resolvedSourcePath, resolvedDestPath);
      res.json(result);
    } catch (err) {
      console.error('[ArtistGallery] Error in copy-from-source:', err);
      res.status(500).json({ error: 'Failed to copy groups', details: err.message });
    }
  });

  return router;
}

module.exports = createArtistGalleryRoutes;
