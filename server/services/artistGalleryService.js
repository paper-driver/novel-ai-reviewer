/**
 * Artist Gallery Service
 * Business logic for artist grouping and gallery management
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'ArtistGalleryService';

class ArtistGalleryService {
  /**
   * Load artist groups from a sorted folder
   * Returns groups with image counts, paths, and metadata
   */
  loadGroups(folderPath) {
    try {
      const resolvedPath = path.resolve(folderPath);

      // Security: Ensure path exists and is directory
      if (!fs.existsSync(resolvedPath)) {
        logger.warn(TAG, `Folder not found: ${resolvedPath}`);
        throw new Error('Folder not found');
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        logger.warn(TAG, `Path is not a directory: ${resolvedPath}`);
        throw new Error('Path is not a directory');
      }

      // Load artist mapping if it exists
      const mappingFile = path.join(resolvedPath, '.artist-mapping.json');
      let artistKeyToFolder = {};
      if (fs.existsSync(mappingFile)) {
        try {
          artistKeyToFolder = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
          logger.debug(TAG, `Loaded artist mapping with ${Object.keys(artistKeyToFolder).length} entries`);
        } catch (err) {
          logger.warn(TAG, `Failed to read mapping file: ${err.message}`);
        }
      }

      // Scan subfolders for artist groups
      const groups = [];
      const subfolders = fs.readdirSync(resolvedPath).filter(f => {
        const fullPath = path.join(resolvedPath, f);
        return f !== '.artist-mapping.json' && fs.statSync(fullPath).isDirectory();
      });

      subfolders.forEach(folderName => {
        const folderPath = path.join(resolvedPath, folderName);
        const files = this._getPngFiles(folderPath);

        if (files.length > 0) {
          // Find original artist key from mapping
          const artistKey = Object.keys(artistKeyToFolder).find(
            key => artistKeyToFolder[key] === folderName
          ) || folderName;

          const artists = artistKey.split(' | ').filter(a => a && a !== 'no-artists');
          const thumbnailPath = files[0];
          const latestModifiedTime = this._getLatestModificationTime(folderPath, files);

          groups.push({
            folderName,
            folderPath,
            artistKey,
            artists,
            imageCount: files.length,
            thumbnailPath,
            images: files,
            latestModifiedTime: latestModifiedTime || Date.now()
          });
        }
      });

      logger.info(TAG, `Loaded ${groups.length} artist groups from ${resolvedPath}`);

      return {
        success: true,
        sortedFolder: resolvedPath,
        baseFolder: resolvedPath,
        groups,
        totals: {
          groups: groups.length,
          images: groups.reduce((sum, g) => sum + g.imageCount, 0)
        }
      };
    } catch (err) {
      logger.error(TAG, `Error loading groups: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all images in a specific artist group folder
   */
  getGroupImages(folderPath) {
    try {
      const resolvedPath = path.resolve(folderPath);

      if (!fs.existsSync(resolvedPath)) {
        logger.warn(TAG, `Folder not found: ${resolvedPath}`);
        throw new Error('Folder not found');
      }

      const files = this._getPngFiles(resolvedPath);
      logger.debug(TAG, `Retrieved ${files.length} images from ${resolvedPath}`);

      return {
        success: true,
        images: files
      };
    } catch (err) {
      logger.error(TAG, `Error loading group images: ${err.message}`);
      throw err;
    }
  }

  /**
   * Extract artist tags from prompt text
   * Looks for patterns like @artist-name
   */
  extractArtistTags(prompt) {
    if (!prompt) return [];
    const matches = prompt.match(/@[\w-]+/g) || [];
    return matches.map(m => m.substring(1)); // Remove @ prefix
  }

  /**
   * Save artist mapping file
   */
  saveArtistMapping(folderPath, mapping) {
    try {
      const mappingFile = path.join(folderPath, '.artist-mapping.json');
      fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
      logger.info(TAG, `Saved artist mapping to ${mappingFile}`);
      return true;
    } catch (err) {
      logger.error(TAG, `Failed to save artist mapping: ${err.message}`);
      throw err;
    }
  }

  /**
   * Load artist mapping file
   */
  loadArtistMapping(folderPath) {
    try {
      const mappingFile = path.join(folderPath, '.artist-mapping.json');
      if (!fs.existsSync(mappingFile)) {
        return {};
      }
      const content = fs.readFileSync(mappingFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      logger.warn(TAG, `Failed to load artist mapping: ${err.message}`);
      return {};
    }
  }

  /**
   * Copy artist groups from source to destination
   * Merges mappings and avoids duplicates
   */
  copyGroupsFromSource(sourcePath, destinationPath) {
    try {
      const resolvedSource = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);

      // Validate both paths exist and are directories
      if (!fs.existsSync(resolvedSource)) {
        throw new Error('Source folder not found');
      }
      if (!fs.existsSync(resolvedDest)) {
        throw new Error('Destination folder not found');
      }

      const sourceStats = fs.statSync(resolvedSource);
      const destStats = fs.statSync(resolvedDest);

      if (!sourceStats.isDirectory() || !destStats.isDirectory()) {
        throw new Error('Both paths must be directories');
      }

      // Load mappings
      const sourceMapping = this.loadArtistMapping(resolvedSource);
      const destMapping = this.loadArtistMapping(resolvedDest);

      let copiedGroups = 0;
      let copiedImages = 0;

      // Get source folders
      const sourceFolders = fs.readdirSync(resolvedSource).filter(f => {
        const fullPath = path.join(resolvedSource, f);
        return f !== '.artist-mapping.json' && fs.statSync(fullPath).isDirectory();
      });

      // Copy each group
      sourceFolders.forEach(folderName => {
        const sourceGroupPath = path.join(resolvedSource, folderName);
        const destGroupPath = path.join(resolvedDest, folderName);

        // Create destination group folder if needed
        if (!fs.existsSync(destGroupPath)) {
          fs.mkdirSync(destGroupPath, { recursive: true });
          copiedGroups++;
        }

        // Copy PNG files
        const sourceFiles = this._getPngFiles(sourceGroupPath);
        sourceFiles.forEach(file => {
          const sourceFile = path.join(sourceGroupPath, file);
          const destFile = path.join(destGroupPath, file);

          // Only copy if destination doesn't have it
          if (!fs.existsSync(destFile)) {
            fs.copyFileSync(sourceFile, destFile);
            copiedImages++;
          }
        });

        // Merge mapping for this group
        const artistKey = Object.keys(sourceMapping).find(
          key => sourceMapping[key] === folderName
        ) || folderName;
        destMapping[artistKey] = folderName;
      });

      // Save merged mapping
      const mergedMapping = Object.keys(destMapping).length > 0;
      if (mergedMapping) {
        this.saveArtistMapping(resolvedDest, destMapping);
      }

      logger.info(TAG, `Copied ${copiedGroups} groups and ${copiedImages} images from ${resolvedSource}`);

      return {
        success: true,
        copiedGroups,
        copiedImages,
        mergedMapping
      };
    } catch (err) {
      logger.error(TAG, `Error copying groups: ${err.message}`);
      throw err;
    }
  }

  /**
   * Helper: Get all PNG files from a directory
   */
  _getPngFiles(dirPath) {
    try {
      return fs.readdirSync(dirPath).filter(f => {
        const fullPath = path.join(dirPath, f);
        return (
          fs.statSync(fullPath).isFile() &&
          f.endsWith('.png') &&
          !f.startsWith('._') &&
          f !== '.DS_Store'
        );
      });
    } catch (err) {
      logger.warn(TAG, `Failed to read PNG files from ${dirPath}: ${err.message}`);
      return [];
    }
  }

  /**
   * Helper: Get latest modification time from files in a folder
   */
  _getLatestModificationTime(folderPath, files) {
    let latestTime = 0;
    files.forEach(file => {
      try {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        const fileModTime = stats.mtimeMs || stats.mtime.getTime();
        if (fileModTime > latestTime) {
          latestTime = fileModTime;
        }
      } catch (err) {
        logger.trace(TAG, `Failed to get mtime for ${file}`);
      }
    });
    return latestTime;
  }
}

module.exports = ArtistGalleryService;
