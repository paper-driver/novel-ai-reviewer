/**
 * Legacy Artist Grouping Service
 * Handles the original /api/group-by-artists and /api/group-by-artists-path endpoints
 * Kept for backward compatibility - DO NOT CHANGE without updating frontend
 */

const fs = require('fs');
const path = require('path');

class LegacyArtistGroupingService {
  constructor(imageMetadataService, feedbackService, logger) {
    this.imageMetadataService = imageMetadataService;
    this.feedbackService = feedbackService;
    this.logger = logger;
    // Track current source path for feedback storage (global state)
    this.currentSourcePath = null;
  }

  /**
   * Group images by artist tags (legacy endpoint: POST /api/group-by-artists/:folder)
   * Works with images in GENERATED_DIR
   */
  groupImagesByArtistsLegacy(folder, generatedDir) {
    const folderPath = path.join(generatedDir, folder);
    
    // Security check
    if (!folderPath.startsWith(generatedDir)) {
      throw new Error('Invalid folder path');
    }
    
    if (!fs.existsSync(folderPath)) {
      throw new Error('Folder not found');
    }
    
    // Read all image files from the folder, filtering out macOS system files
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.png') && !this._isMacSystemFile(f));
    
    // Group images by artist combination
    const artistGroups = {};
    const imageMetadata = [];
    
    files.forEach(filename => {
      try {
        const imagePath = path.join(folderPath, filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = this.imageMetadataService.readPNGMetadata(imageBuffer);
        
        let artists = [];
        let prompt = null;
        
        // Extract generation data
        if (metadata.comment) {
          try {
            const commentData = JSON.parse(metadata.comment);
            prompt = commentData.prompt || '';
          } catch (e) {
            prompt = metadata.comment;
          }
        }
        
        // Extract artist tags from prompt
        if (prompt) {
          artists = this.imageMetadataService.extractArtistTags(prompt);
        }
        
        // Create a canonical key from sorted artist names for consistent grouping
        const artistKey = artists.length > 0 
          ? artists.join(' | ')
          : 'no-artists';
        
        if (!artistGroups[artistKey]) {
          artistGroups[artistKey] = [];
        }
        artistGroups[artistKey].push(filename);
        
        imageMetadata.push({
          filename,
          artists,
          artistKey
        });
      } catch (err) {
        this.logger.warn('LegacyGrouping', `Error processing image ${filename}: ${err.message}`);
      }
    });
    
    // Create subfolder structure using artist tag combinations as folder names
    const results = {};
    const folderMapping = {};
    
    Object.entries(artistGroups).forEach(([artistKey, imageFilenames]) => {
      let folderName = this._sanitizeFolderName(artistKey);
      
      // If folder name would exceed 255 chars, truncate and add hash for uniqueness
      if (folderName.length > 255) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(artistKey).digest('hex').substring(0, 8);
        const maxNameLength = 255 - hash.length - 1;
        folderName = this._sanitizeFolderName(artistKey.substring(0, maxNameLength)) + '_' + hash;
      }
      
      const subfolder = path.join(folderPath, folderName);
      
      // Create subfolder if it doesn't exist
      if (!fs.existsSync(subfolder)) {
        fs.mkdirSync(subfolder, { recursive: true });
      }
      
      // Copy/move images to the subfolder
      imageFilenames.forEach(filename => {
        try {
          const srcPath = path.join(folderPath, filename);
          const destPath = path.join(subfolder, filename);
          
          fs.copyFileSync(srcPath, destPath);
        } catch (err) {
          this.logger.warn('LegacyGrouping', `Error copying ${filename}: ${err.message}`);
        }
      });
      
      results[folderName] = {
        artistKey,
        artists: artistKey.split(' | ').filter(a => a !== 'no-artists'),
        count: imageFilenames.length,
        images: imageFilenames
      };
      
      folderMapping[folderName] = artistKey;
    });
    
    // Write mapping file to source folder for reference
    const mappingFile = path.join(folderPath, '_artist_mapping.json');
    fs.writeFileSync(mappingFile, JSON.stringify(folderMapping, null, 2));
    
    return {
      success: true,
      sourceFolder: folder,
      totalImages: files.length,
      groupCount: Object.keys(results).length,
      groups: results,
      imageMetadata: imageMetadata
    };
  }

  /**
   * Group images by artist tags from custom paths (legacy endpoint: POST /api/group-by-artists-path)
   * Supports incremental sorting: skips existing images and reuses existing artist folders
   */
  groupImagesByArtistsPath(sourcePath, destinationPath, usePreSorted = false) {
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedDestPath = path.resolve(destinationPath);
    
    // ===== Set current source path for feedback storage =====
    this.currentSourcePath = resolvedSourcePath;
    if (this.feedbackService) {
      this.feedbackService.setCurrentSourcePath(resolvedSourcePath);
    }
    this.logger.debug('LegacyGrouping', `Set current source path to: ${this.currentSourcePath}`);
    
    // Check if source folder exists
    if (!fs.existsSync(resolvedSourcePath)) {
      throw new Error(`Source folder not found: ${sourcePath}`);
    }
    
    // Create destination folder if it doesn't exist
    if (!fs.existsSync(resolvedDestPath)) {
      fs.mkdirSync(resolvedDestPath, { recursive: true });
    }
    
    // STEP 1: Load existing mapping
    const mappingFile = path.join(resolvedDestPath, '_artist_mapping.json');
    let existingMapping = {};
    let existingImages = new Set();
    
    if (fs.existsSync(mappingFile)) {
      try {
        existingMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        
        // Build a set of all existing images in destination folders
        Object.keys(existingMapping).forEach(folderName => {
          const folderPath = path.join(resolvedDestPath, folderName);
          if (fs.existsSync(folderPath)) {
            const folderFiles = fs.readdirSync(folderPath)
              .filter(f => f.endsWith('.png') && !this._isMacSystemFile(f));
            folderFiles.forEach(file => existingImages.add(file));
          }
        });
      } catch (e) {
        this.logger.warn('LegacyGrouping', `Could not load existing mapping: ${e.message}`);
      }
    }
    
    // Create reverse mapping: artistKey -> folderName
    const artistKeyToFolder = {};
    Object.entries(existingMapping).forEach(([folderName, artistKey]) => {
      artistKeyToFolder[artistKey] = folderName;
    });

    // AUTO-DETECT: Check if source folder has _artist_mapping.json (pre-sorted)
    const sourceMappingFile = path.join(resolvedSourcePath, '_artist_mapping.json');
    const isSourcePreSorted = fs.existsSync(sourceMappingFile);
    
    // Use fast path if either explicitly requested OR auto-detected
    const shouldUseFastPath = usePreSorted || isSourcePreSorted;

    // === FAST PATH: USE PRE-SORTED SOURCE ===
    if (shouldUseFastPath) {
      return this._groupImagesFastPath(
        resolvedSourcePath,
        resolvedDestPath,
        mappingFile,
        artistKeyToFolder,
        existingImages
      );
    }

    // === SLOW PATH: READ IMAGE METADATA ===
    return this._groupImagesSlowPath(
      resolvedSourcePath,
      resolvedDestPath,
      mappingFile,
      artistKeyToFolder,
      existingImages
    );
  }

  /**
   * Fast path: Use pre-sorted source structure
   */
  _groupImagesFastPath(resolvedSourcePath, resolvedDestPath, mappingFile, artistKeyToFolder, existingImages) {
    const sourceMappingFile = path.join(resolvedSourcePath, '_artist_mapping.json');
    let sourceMapping = {};
    let results = {};
    let newFoldersCreated = 0;
    let copiedImages = 0;
    const imageMetadata = [];
    const skippedImages = [];

    if (fs.existsSync(sourceMappingFile)) {
      try {
        sourceMapping = JSON.parse(fs.readFileSync(sourceMappingFile, 'utf8'));
      } catch (e) {
        this.logger.warn('LegacyGrouping', `Could not load source mapping: ${e.message}`);
      }
    }

    // If mapping is empty, scan subdirectories directly
    if (Object.keys(sourceMapping).length === 0) {
      const allItems = fs.readdirSync(resolvedSourcePath);
      allItems.forEach(item => {
        const itemPath = path.join(resolvedSourcePath, item);
        try {
          if (fs.statSync(itemPath).isDirectory() && !item.startsWith('.')) {
            sourceMapping[item] = item;
          }
        } catch (e) {
          // Skip if can't stat
        }
      });
    }

    // Get all folders from source that are in the mapping
    Object.entries(sourceMapping).forEach(([artistKey, folderName]) => {
      const sourceFolderPath = path.join(resolvedSourcePath, folderName);
      
      if (!fs.existsSync(sourceFolderPath)) {
        return;
      }

      // Determine destination folder name
      let destFolderName = folderName;
      if (artistKeyToFolder[artistKey]) {
        destFolderName = artistKeyToFolder[artistKey];
      } else {
        newFoldersCreated++;
        artistKeyToFolder[artistKey] = folderName;
      }

      const destFolderPath = path.join(resolvedDestPath, destFolderName);

      // Create destination folder if needed
      if (!fs.existsSync(destFolderPath)) {
        fs.mkdirSync(destFolderPath, { recursive: true });
      }

      // Copy images from source folder
      const sourceFiles = fs.readdirSync(sourceFolderPath)
        .filter(f => f.endsWith('.png') && !this._isMacSystemFile(f));

      let copiedCount = 0;
      sourceFiles.forEach(filename => {
        // Skip if image already exists
        if (existingImages.has(filename)) {
          skippedImages.push(filename);
          return;
        }

        const srcFilePath = path.join(sourceFolderPath, filename);
        const destFilePath = path.join(destFolderPath, filename);

        try {
          fs.copyFileSync(srcFilePath, destFilePath);
          copiedImages++;
          copiedCount++;
          existingImages.add(filename);
          imageMetadata.push({
            filename,
            artists: artistKey === 'no-artists' ? [] : artistKey.split(' | '),
            artistKey
          });
        } catch (err) {
          this.logger.warn('LegacyGrouping', `Error copying ${filename}: ${err.message}`);
        }
      });

      results[destFolderName] = {
        artistKey,
        artists: artistKey === 'no-artists' ? [] : artistKey.split(' | '),
        newCount: copiedCount,
        totalCount: sourceFiles.length,
        images: sourceFiles
      };
    });

    // Update destination mapping
    fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));

    return {
      success: true,
      sourceFolder: resolvedSourcePath,
      destinationFolder: resolvedDestPath,
      totalSourceImages: imageMetadata.length + skippedImages.length,
      skippedImages: skippedImages,
      skippedCount: skippedImages.length,
      imagesToProcess: imageMetadata.length,
      newFoldersCreated,
      groups: results,
      imageMetadata: imageMetadata
    };
  }

  /**
   * Slow path: Read and analyze image metadata
   */
  _groupImagesSlowPath(resolvedSourcePath, resolvedDestPath, mappingFile, artistKeyToFolder, existingImages) {
    // STEP 2: Read all image files from the source folder
    const files = fs.readdirSync(resolvedSourcePath)
      .filter(f => f.endsWith('.png') && !this._isMacSystemFile(f));
    
    if (files.length === 0) {
      // Check if this might be a pre-sorted folder with subdirectories
      const allItems = fs.readdirSync(resolvedSourcePath);
      this.logger.debug('LegacyGrouping', `Source folder contents: ${allItems.join(', ')}`);
      
      const hasSubdirectories = allItems.some(item => {
        try {
          return fs.statSync(path.join(resolvedSourcePath, item)).isDirectory() && !item.startsWith('.');
        } catch (e) {
          return false;
        }
      });
      
      if (hasSubdirectories) {
        throw new Error('No PNG files found at the root level. The source folder appears to be organized with subdirectories.');
      }
      
      throw new Error('No PNG files found in the source folder');
    }
    
    // STEP 3: Process files, group by artist combination
    const artistGroups = {};
    const imageMetadata = [];
    const skippedImages = [];
    let imagesToProcess = 0;
    
    files.forEach(filename => {
      // Check if image already exists in destination
      if (existingImages.has(filename)) {
        skippedImages.push(filename);
        return;
      }
      
      imagesToProcess++;
      
      try {
        const imagePath = path.join(resolvedSourcePath, filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = this.imageMetadataService.readPNGMetadata(imageBuffer);
        
        let artists = [];
        let prompt = null;
        
        // Extract generation data
        if (metadata.comment) {
          try {
            const commentData = JSON.parse(metadata.comment);
            prompt = commentData.prompt || '';
          } catch (e) {
            prompt = metadata.comment;
          }
        }
        
        // Extract artist tags from prompt
        if (prompt) {
          artists = this.imageMetadataService.extractArtistTags(prompt);
        }
        
        // Create a canonical key from artist combination
        const artistKey = artists.length > 0 
          ? artists.join(' | ')
          : 'no-artists';
        
        if (!artistGroups[artistKey]) {
          artistGroups[artistKey] = [];
        }
        artistGroups[artistKey].push(filename);
        
        imageMetadata.push({
          filename,
          artists,
          artistKey
        });
      } catch (err) {
        this.logger.warn('LegacyGrouping', `Error processing image ${filename}: ${err.message}`);
      }
    });
    
    // STEP 4: Create/reuse subfolder structure and copy new images
    const results = {};
    let newFoldersCreated = 0;
    
    Object.entries(artistGroups).forEach(([artistKey, imageFilenames]) => {
      // Check if we already have a folder for this artist combination
      let folderName;
      
      if (artistKeyToFolder[artistKey]) {
        folderName = artistKeyToFolder[artistKey];
      } else {
        folderName = this._sanitizeFolderName(artistKey);
        
        // If folder name would exceed 255 chars, truncate and add hash for uniqueness
        if (folderName.length > 255) {
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(artistKey).digest('hex').substring(0, 8);
          const maxNameLength = 255 - hash.length - 1;
          folderName = this._sanitizeFolderName(artistKey.substring(0, maxNameLength)) + '_' + hash;
        }
        
        newFoldersCreated++;
        artistKeyToFolder[artistKey] = folderName;
      }
      
      const subfolder = path.join(resolvedDestPath, folderName);
      
      // Create subfolder if it doesn't exist
      if (!fs.existsSync(subfolder)) {
        fs.mkdirSync(subfolder, { recursive: true });
      }
      
      // Copy new images to the subfolder
      let copiedCount = 0;
      imageFilenames.forEach(filename => {
        try {
          const srcPath = path.join(resolvedSourcePath, filename);
          const destPath = path.join(subfolder, filename);
          
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
            copiedCount++;
          }
        } catch (err) {
          this.logger.warn('LegacyGrouping', `Error copying ${filename}: ${err.message}`);
        }
      });
      
      results[folderName] = {
        artistKey,
        artists: artistKey.split(' | ').filter(a => a !== 'no-artists'),
        newCount: copiedCount,
        totalCount: imageFilenames.length,
        images: imageFilenames
      };
    });
    
    // STEP 5: Update and write mapping file with all folders (old + new)
    fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));
    
    return {
      success: true,
      sourceFolder: resolvedSourcePath,
      destinationFolder: resolvedDestPath,
      totalSourceImages: files.length,
      skippedImages: skippedImages,
      skippedCount: skippedImages.length,
      imagesToProcess: imagesToProcess,
      newFoldersCreated,
      groups: results,
      imageMetadata: imageMetadata
    };
  }

  /**
   * Helper: Sanitize folder name
   */
  _sanitizeFolderName(artistKey) {
    let folderName = artistKey.replace(/ \| /g, ' - ');
    
    folderName = folderName
      .replace(/[\/\0]/g, '')
      .replace(/[:*?"<>|]/g, '')
      .trim();
    
    if (!folderName || folderName === 'no-artists') {
      folderName = 'no-artists';
    }
    
    return folderName;
  }

  /**
   * Helper: Check if filename is macOS system file
   */
  _isMacSystemFile(filename) {
    return filename.startsWith('.') && (filename === '.DS_Store' || filename.startsWith('._'));
  }

  /**
   * Get current source path (for feedback storage)
   */
  getCurrentSourcePath() {
    return this.currentSourcePath;
  }

  /**
   * Set current source path (for feedback storage)
   */
  setCurrentSourcePath(sourcePath) {
    this.currentSourcePath = sourcePath;
    if (this.feedbackService) {
      this.feedbackService.setCurrentSourcePath(sourcePath);
    }
  }
}

module.exports = LegacyArtistGroupingService;
