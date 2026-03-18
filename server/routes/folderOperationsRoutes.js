/**
 * Folder Operations Routes
 * HTTP endpoints for folder picker and file manager operations
 * Delegates operations to FolderOperationsService
 */

const express = require('express');
const logger = require('../utils/logger');

const TAG = 'FolderOperationsRoutes';

function createFolderOperationsRouter(folderOperationsService) {
  const router = express.Router();

  /**
   * POST /api/pick-folder
   * Open system folder picker dialog
   * Returns: { success, path } or { success: false, cancelled: true }
   */
  router.post('/pick-folder', (req, res) => {
    try {
      logger.debug(TAG, `Opening folder picker`);
      const result = folderOperationsService.pickFolder();

      if (result.success) {
        logger.info(TAG, `Folder selected: ${result.path}`);
        res.json(result);
      } else if (result.cancelled) {
        logger.info(TAG, `Folder picker cancelled by user`);
        res.json(result);
      } else {
        logger.warn(TAG, `Folder picker error: ${result.error}`);
        res.status(400).json(result);
      }
    } catch (err) {
      logger.error(TAG, `Folder picker failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to open folder picker', details: err.message });
    }
  });

  /**
   * POST /api/open-folder
   * Open a folder in the system file explorer
   * Body: { path: "/path/to/folder" }
   * Returns: { success: true }
   */
  router.post('/open-folder', (req, res) => {
    try {
      const { path: folderPath } = req.body;

      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path required' });
      }

      logger.debug(TAG, `Opening folder: ${folderPath}`);
      folderOperationsService.openFolder(folderPath);

      logger.info(TAG, `Opened folder: ${folderPath}`);
      res.json({ success: true, path: folderPath });
    } catch (err) {
      logger.error(TAG, `Failed to open folder: ${err.message}`);
      res.status(500).json({ error: 'Failed to open folder', details: err.message });
    }
  });

  /**
   * POST /api/open-file
   * Open a file in the system default application
   * Body: { path: "/path/to/file" }
   * Returns: { success: true }
   */
  router.post('/open-file', (req, res) => {
    try {
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
      }

      const fs = require('fs');
      const { execSync } = require('child_process');
      const os = require('os');
      const platform = os.platform();

      if (!fs.existsSync(filePath)) {
        logger.warn(TAG, `File not found: ${filePath}`);
        return res.status(400).json({ error: 'File not found' });
      }

      logger.debug(TAG, `Opening file: ${filePath}`);

      try {
        if (platform === 'darwin') {
          // macOS - use open -R to reveal in Finder
          execSync(`open -R "${filePath}"`, { stdio: 'ignore' });
        } else if (platform === 'win32') {
          // Windows - use explorer to open folder and select file
          execSync(`explorer /select,"${filePath}"`, { stdio: 'ignore', shell: 'cmd.exe' });
        } else if (platform === 'linux') {
          // Linux - use xdg-open
          execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
        }

        logger.info(TAG, `Opened file: ${filePath}`);
        res.json({ success: true, path: filePath });
      } catch (err) {
        logger.error(TAG, `Failed to open file: ${err.message}`);
        res.status(500).json({ error: 'Failed to open file' });
      }
    } catch (err) {
      logger.error(TAG, `Error in open-file endpoint: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createFolderOperationsRouter;
