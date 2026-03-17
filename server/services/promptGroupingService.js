/**
 * Prompt Grouping Service
 * Groups images by normalized prompt text with caching
 * Handles metadata extraction and prompt normalization
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TAG = 'PromptGroupingService';

// Track progress for long-running operations
const loadingProgress = new Map();

class PromptGroupingService {
  constructor(folderOperationsService) {
    this.folderOperationsService = folderOperationsService;
    this.loadingProgress = loadingProgress;
  }

  /**
   * Load and group images by prompt with caching support
   */
  loadGroups(folderPath, useCache = true) {
    try {
      const resolvedPath = path.resolve(folderPath);

      // Security: validate path
      if (!fs.existsSync(resolvedPath)) {
        throw new Error('Folder not found');
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      const mappingFile = path.join(resolvedPath, '.prompt-mapping.json');

      // Try to use cached mapping
      if (useCache && fs.existsSync(mappingFile)) {
        const cacheResult = this._tryUseCache(resolvedPath, mappingFile);
        if (cacheResult) {
          return cacheResult;
        }
      }

      // Full reprocessing needed
      return this._reprocessGroups(resolvedPath, mappingFile);
    } catch (err) {
      logger.error(TAG, `Error loading groups: ${err.message}`);
      throw err;
    }
  }

  /**
   * Set nickname for a group
   */
  setGroupNickname(folderPath, groupId, nickname) {
    try {
      const resolvedPath = path.resolve(folderPath);
      const mappingFile = path.join(resolvedPath, '.prompt-mapping.json');

      if (!fs.existsSync(mappingFile)) {
        throw new Error('Mapping file not found');
      }

      const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
      if (!mapping.groupNicknames) {
        mapping.groupNicknames = {};
      }

      mapping.groupNicknames[groupId] = nickname;
      fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));

      logger.info(TAG, `Set nickname for group ${groupId}: ${nickname}`);
      return true;
    } catch (err) {
      logger.error(TAG, `Failed to set nickname: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get progress for a loading operation
   */
  getProgress(folderPath) {
    const resolvedPath = path.resolve(folderPath);
    return this.loadingProgress.get(resolvedPath) || { status: 'idle' };
  }

  /**
   * Get image from a group by path
   */
  getGroupImage(folderPath, imagePath) {
    try {
      const resolvedPath = path.resolve(folderPath);
      const imageFullPath = path.join(resolvedPath, imagePath);

      // Security: prevent directory traversal
      if (!imageFullPath.startsWith(resolvedPath)) {
        throw new Error('Invalid path');
      }

      if (!fs.existsSync(imageFullPath)) {
        throw new Error('Image not found');
      }

      return fs.readFileSync(imageFullPath);
    } catch (err) {
      logger.error(TAG, `Error reading image: ${err.message}`);
      throw err;
    }
  }

  /**
   * Try to use cached mapping if valid
   */
  _tryUseCache(resolvedPath, mappingFile) {
    try {
      const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

      // Validate cache
      const pngFiles = this.folderOperationsService.scanPNGFilesRecursive(resolvedPath);
      const lastUpdated = mapping.lastUpdated ? new Date(mapping.lastUpdated).getTime() : 0;
      const cachedFileCount = mapping.totalFileCount || 0;
      const hasModifiedFiles = pngFiles.some(f => {
        try {
          const stats = fs.statSync(f);
          const mtime = stats.mtimeMs || stats.mtime.getTime();
          return mtime > lastUpdated;
        } catch (err) {
          return false;
        }
      });
      const fileCountChanged = pngFiles.length !== cachedFileCount;

      logger.debug(TAG, `Cache validation: cached=${cachedFileCount}, current=${pngFiles.length}, modified=${hasModifiedFiles}`);

      if (!hasModifiedFiles && !fileCountChanged && mapping.groups && Object.keys(mapping.groups).length > 0) {
        logger.info(TAG, `Using cached mapping for ${resolvedPath}`);

        const groupNicknames = mapping.groupNicknames || {};
        const promptGroups = mapping.groups || {};

        const groupsArray = Object.values(promptGroups).map(group => {
          if (!group.images || group.images.length === 0) return null;

          let latestModifiedTime = group.latestModifiedTime || 0;
          if (!latestModifiedTime) {
            group.images.forEach(imgFile => {
              try {
                const filePath = path.join(resolvedPath, imgFile);
                if (fs.existsSync(filePath)) {
                  const fileStats = fs.statSync(filePath);
                  const fileModTime = fileStats.mtimeMs || fileStats.mtime.getTime();
                  if (fileModTime > latestModifiedTime) {
                    latestModifiedTime = fileModTime;
                  }
                }
              } catch (err) {
                logger.trace(TAG, `Error getting mtime: ${err.message}`);
              }
            });
          }

          return {
            groupId: group.groupId,
            groupName: group.groupName,
            groupNickname: groupNicknames[group.groupId] || '',
            normalizedPrompt: group.normalizedPrompt,
            sampleOriginalPrompt: group.sampleOriginalPrompt,
            images: group.images,
            imageCount: group.images.length,
            thumbnailPath: group.images[0],
            latestModifiedTime: latestModifiedTime || Date.now()
          };
        }).filter(g => g !== null);

        return {
          success: true,
          folder: resolvedPath,
          groups: groupsArray,
          totals: {
            groups: groupsArray.length,
            images: groupsArray.reduce((sum, g) => sum + g.imageCount, 0)
          },
          cached: true
        };
      }

      logger.debug(TAG, 'Cache invalidated, will reprocess');
      return null;
    } catch (err) {
      logger.warn(TAG, `Cache validation failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Reprocess all groups from scratch
   */
  _reprocessGroups(resolvedPath, mappingFile) {
    logger.info(TAG, `Reprocessing ${resolvedPath}`);

    let promptGroups = {};
    let promptToGroupId = {};
    let groupNicknames = {};

    // Load existing mapping if available
    if (fs.existsSync(mappingFile)) {
      try {
        const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        promptGroups = mapping.groups || {};
        promptToGroupId = mapping.promptToGroupId || {};
        groupNicknames = mapping.groupNicknames || {};
      } catch (err) {
        logger.warn(TAG, `Failed to read mapping: ${err.message}`);
      }
    }

    // Scan PNG files
    const pngFiles = this.folderOperationsService.scanPNGFilesRecursive(resolvedPath);
    logger.info(TAG, `Found ${pngFiles.length} PNG files`);

    // Set progress
    const folderKey = resolvedPath;
    this.loadingProgress.set(folderKey, {
      totalFiles: pngFiles.length,
      processedFiles: 0,
      status: 'processing'
    });

    // Process each file
    const processedImages = {};
    pngFiles.forEach((filePath, index) => {
      try {
        const relativePath = path.relative(resolvedPath, filePath);
        const fileBuffer = fs.readFileSync(filePath);

        // Extract prompt from PNG metadata
        let prompt = this._extractPrompt(fileBuffer, path.basename(filePath));

        if (prompt) {
          const normalizedPrompt = this._normalizePrompt(prompt);
          processedImages[relativePath] = {
            originalPrompt: prompt,
            normalizedPrompt: normalizedPrompt,
            fullPath: filePath
          };
        }
      } catch (err) {
        logger.warn(TAG, `Failed to process file: ${err.message}`);
      }

      // Update progress
      this.loadingProgress.set(folderKey, {
        totalFiles: pngFiles.length,
        processedFiles: index + 1,
        status: 'processing'
      });
    });

    // Group by normalized prompt
    const nextGroupId = Math.max(0, ...Object.keys(promptGroups).map(Number)) + 1;
    let currentGroupId = nextGroupId;

    for (const [relativePath, imgData] of Object.entries(processedImages)) {
      const normalized = imgData.normalizedPrompt;

      if (promptToGroupId[normalized]) {
        const groupId = promptToGroupId[normalized];
        if (promptGroups[groupId] && !promptGroups[groupId].images.includes(relativePath)) {
          promptGroups[groupId].images.push(relativePath);
        }
      } else {
        const groupId = currentGroupId++;
        promptToGroupId[normalized] = groupId;
        promptGroups[groupId] = {
          groupId: groupId,
          groupName: `Group ${groupId}`,
          normalizedPrompt: normalized,
          images: [relativePath],
          sampleOriginalPrompt: imgData.originalPrompt
        };
      }
    }

    // Build result
    const groupsArray = Object.values(promptGroups).map(group => {
      if (!group.images || group.images.length === 0) return null;

      const uniqueImages = Array.from(new Set(group.images));
      group.images = uniqueImages;

      let latestModifiedTime = 0;
      group.images.forEach(imgFile => {
        try {
          const filePath = path.join(resolvedPath, imgFile);
          if (fs.existsSync(filePath)) {
            const fileStats = fs.statSync(filePath);
            const fileModTime = fileStats.mtimeMs || fileStats.mtime.getTime();
            if (fileModTime > latestModifiedTime) {
              latestModifiedTime = fileModTime;
            }
          }
        } catch (err) {
          logger.trace(TAG, `Error getting mtime: ${err.message}`);
        }
      });

      return {
        groupId: group.groupId,
        groupName: group.groupName,
        groupNickname: groupNicknames[group.groupId] || '',
        normalizedPrompt: group.normalizedPrompt,
        sampleOriginalPrompt: group.sampleOriginalPrompt,
        images: group.images,
        imageCount: group.images.length,
        thumbnailPath: group.images[0],
        latestModifiedTime: latestModifiedTime || Date.now()
      };
    }).filter(g => g !== null);

    // Save mapping
    try {
      const mappingToSave = {
        groups: Object.fromEntries(Object.entries(promptGroups).map(([id, g]) => [
          id,
          {
            ...g,
            latestModifiedTime: groupsArray.find(ga => ga.groupId === parseInt(id))?.latestModifiedTime
          }
        ])),
        promptToGroupId: promptToGroupId,
        groupNicknames: groupNicknames,
        lastUpdated: new Date().toISOString(),
        totalFileCount: pngFiles.length
      };
      fs.writeFileSync(mappingFile, JSON.stringify(mappingToSave, null, 2));
      logger.info(TAG, `Saved mapping to ${mappingFile}`);
    } catch (err) {
      logger.warn(TAG, `Failed to save mapping: ${err.message}`);
    }

    // Clear progress
    this.loadingProgress.delete(folderKey);

    return {
      success: true,
      folder: resolvedPath,
      groups: groupsArray,
      totals: {
        groups: groupsArray.length,
        images: groupsArray.reduce((sum, g) => sum + g.imageCount, 0)
      },
      cached: false
    };
  }

  /**
   * Extract prompt from PNG metadata or filename
   */
  _extractPrompt(buffer, filename) {
    // This would use ImageMetadataService in practice
    // For now, simplified version
    try {
      // Try to find prompt in filename
      const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
      if (match) {
        return match[1];
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Normalize prompt for grouping
   * Removes unnecessary spaces, punctuation, and case-insensitivity
   */
  _normalizePrompt(prompt) {
    if (!prompt) return '';
    return prompt
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '');
  }
}

module.exports = PromptGroupingService;
