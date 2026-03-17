/**
 * Legacy Grouping Routes
 * Backward compatibility routes for /api/group-by-artists endpoints
 * These are called by the frontend and MUST maintain exact compatibility
 */

const express = require('express');

function createLegacyGroupingRoutes(legacyGroupingService, generatedDir, logger) {
  const router = express.Router();

  /**
   * POST /api/group-by-artists/:folder
   * Groups images in a specific folder by artist tags (from GENERATED_DIR)
   * 
   * Legacy endpoint for backward compatibility
   */
  router.post('/group-by-artists/:folder', (req, res) => {
    try {
      const { folder } = req.params;
      
      logger.info('LegacyGrouping', `Processing folder: ${folder}`);
      
      const result = legacyGroupingService.groupImagesByArtistsLegacy(folder, generatedDir);
      
      logger.info('LegacyGrouping', `Successfully grouped ${result.groupCount} artist groups with ${result.totalImages} images`);
      
      res.json(result);
    } catch (error) {
      logger.error('LegacyGrouping', `Error in group-by-artists: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/group-by-artists-path
   * Groups images from a source folder into destination folder by artist tags
   * Supports incremental syncing: skips existing images and reuses existing folders
   * 
   * Request body:
   * {
   *   sourcePath: string - path to folder with PNG images
   *   destinationPath: string - path where grouped folders will be created
   *   usePreSorted?: boolean - if true, assumes source is pre-sorted with mapping
   * }
   * 
   * Critical side effect: Sets currentSourcePath for feedback storage
   * Frontend depends on this side effect!
   */
  router.post('/group-by-artists-path', (req, res) => {
    try {
      const { sourcePath, destinationPath, usePreSorted = false } = req.body;
      
      if (!sourcePath || !destinationPath) {
        return res.status(400).json({
          success: false,
          error: 'sourcePath and destinationPath are required'
        });
      }
      
      logger.info('LegacyGrouping', `Grouping from ${sourcePath} to ${destinationPath} (usePreSorted: ${usePreSorted})`);
      
      const result = legacyGroupingService.groupImagesByArtistsPath(
        sourcePath,
        destinationPath,
        usePreSorted
      );
      
      logger.info('LegacyGrouping', `Successfully grouped ${Object.keys(result.groups).length} artist groups with ${result.totalSourceImages} total images, copied ${result.imagesToProcess} new images`);
      
      res.json(result);
    } catch (error) {
      logger.error('LegacyGrouping', `Error in group-by-artists-path: ${error.message}`);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createLegacyGroupingRoutes;
