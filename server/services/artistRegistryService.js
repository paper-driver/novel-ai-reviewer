const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Artist Registry Service
 * Manages artist registry file operations, CRUD operations, and metadata management
 */
class ArtistRegistryService {
  /**
   * Load registry from .registry.json file
   * @param {string} folderPath - Path to folder containing .registry.json
   * @returns {object} Registry data
   */
  loadRegistry(folderPath) {
    try {
      const registryPath = path.join(folderPath, '.registry.json');
      if (!fs.existsSync(registryPath)) {
        return this.initializeRegistry(folderPath);
      }
      const data = fs.readFileSync(registryPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading registry:', error);
      return this.initializeRegistry(folderPath);
    }
  }

  /**
   * Initialize a new registry file
   * @param {string} folderPath - Path to folder for registry
   * @returns {object} New registry structure
   */
  initializeRegistry(folderPath) {
    const registry = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      folder: folderPath,
      artists: []
    };
    this.saveRegistry(folderPath, registry);
    return registry;
  }

  /**
   * Save registry to .registry.json file
   * @param {string} folderPath - Path to folder for registry
   * @param {object} registryData - Registry data to save
   */
  saveRegistry(folderPath, registryData) {
    try {
      // Ensure folder exists
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const registryPath = path.join(folderPath, '.registry.json');
      registryData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(registryPath, JSON.stringify(registryData, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving registry:', error);
      throw error;
    }
  }

  /**
   * Add new artist to registry
   * @param {string} folderPath - Path to registry folder
   * @param {object} artistData - Artist data to add
   * @returns {object} Added artist with ID
   */
  addArtist(folderPath, artistData) {
    const registry = this.loadRegistry(folderPath);
    
    // Check for duplicate
    if (registry.artists.some(a => a.name === artistData.name)) {
      throw new Error(`Artist "${artistData.name}" already exists in registry`);
    }

    const artist = {
      id: uuidv4(),
      name: artistData.name,
      artStyle: artistData.artStyle || 'undefined',
      strength: 0, // Will be calculated after first image pair
      strengthLabel: 'unknown',
      confidence: 0,
      anatomy: artistData.anatomy || 0,
      object: artistData.object || 0,
      colouring: artistData.colouring || 0,
      promptInterpretation: artistData.promptInterpretation || 0,
      imagesCount: 0,
      validationStatus: 'pending',
      lpipsScores: [],
      googleVisionScores: [],
      lastUpdated: new Date().toISOString(),
      metadata: {
        addedBy: 'user',
        description: artistData.description || '',
        notes: artistData.notes || ''
      }
    };

    registry.artists.push(artist);
    this.saveRegistry(folderPath, registry);

    // Create artist folder structure
    this.createArtistFolderStructure(folderPath, artistData.name);

    return artist;
  }

  /**
   * Update artist metadata in registry
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistId - Artist ID
   * @param {object} updateData - Data to update (excludes strength)
   * @returns {object} Updated artist
   */
  updateArtist(folderPath, artistId, updateData) {
    const registry = this.loadRegistry(folderPath);
    const artistIndex = registry.artists.findIndex(a => a.id === artistId);

    if (artistIndex === -1) {
      throw new Error(`Artist with ID "${artistId}" not found`);
    }

    const artist = registry.artists[artistIndex];
    
    // Only allow updating these fields (not strength which is auto-calculated)
    const allowedFields = ['anatomy', 'object', 'colouring', 'promptInterpretation', 'artStyle', 'metadata'];
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        artist[key] = updateData[key];
      }
    });

    artist.lastUpdated = new Date().toISOString();
    registry.artists[artistIndex] = artist;
    this.saveRegistry(folderPath, registry);

    return artist;
  }

  /**
   * Delete artist from registry (including files)
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistId - Artist ID
   */
  deleteArtist(folderPath, artistId) {
    const registry = this.loadRegistry(folderPath);
    const artistIndex = registry.artists.findIndex(a => a.id === artistId);

    if (artistIndex === -1) {
      throw new Error(`Artist with ID "${artistId}" not found`);
    }

    const artist = registry.artists[artistIndex];
    const artistFolderPath = path.join(folderPath, artist.name);

    // Delete artist folder
    if (fs.existsSync(artistFolderPath)) {
      fs.rmSync(artistFolderPath, { recursive: true, force: true });
    }

    // Remove from registry
    registry.artists.splice(artistIndex, 1);
    this.saveRegistry(folderPath, registry);
  }

  /**
   * Get artist by ID
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistId - Artist ID
   * @returns {object} Artist data
   */
  getArtist(folderPath, artistId) {
    const registry = this.loadRegistry(folderPath);
    const artist = registry.artists.find(a => a.id === artistId);
    
    if (!artist) {
      throw new Error(`Artist with ID "${artistId}" not found`);
    }

    return artist;
  }

  /**
   * List all artists in registry
   * @param {string} folderPath - Path to registry folder
   * @returns {array} Array of artists
   */
  listArtists(folderPath) {
    const registry = this.loadRegistry(folderPath);
    return registry.artists;
  }

  /**
   * Create folder structure for artist
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistName - Artist name
   */
  createArtistFolderStructure(folderPath, artistName) {
    const basePath = path.join(folderPath, artistName);
    const baseDir = path.join(basePath, 'base');
    const withArtistDir = path.join(basePath, 'with_artist');

    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      if (!fs.existsSync(withArtistDir)) {
        fs.mkdirSync(withArtistDir, { recursive: true });
      }
    } catch (error) {
      console.error('Error creating artist folder structure:', error);
    }
  }

  /**
   * Update artist strength with new LPIPS and Google Vision scores
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistId - Artist ID
   * @param {number} lpipsScore - New LPIPS score (0-1)
   * @param {number} googleVisionScore - New Google Vision score (0-1)
   * @returns {object} Updated artist
   */
  updateArtistStrength(folderPath, artistId, lpipsScore, googleVisionScore) {
    const registry = this.loadRegistry(folderPath);
    const artist = registry.artists.find(a => a.id === artistId);

    if (!artist) {
      throw new Error(`Artist with ID "${artistId}" not found`);
    }

    // Store individual scores
    artist.lpipsScores.push(lpipsScore);
    artist.googleVisionScores.push(googleVisionScore);

    // Calculate hybrid strength (GV×0.33 + LPIPS×0.67)
    // Normalize scores first
    const normalizedGV = Math.min(googleVisionScore / 0.4, 1); // Practical max = 0.4
    const normalizedLPIPS = Math.min(lpipsScore / 0.5, 1); // Practical max = 0.5

    // Calculate average if multiple pairs
    const avgNormalizedGV = (artist.lpipsScores.length - 1) > 0
      ? artist.googleVisionScores.reduce((a, b) => a + Math.min(b / 0.4, 1), 0) / artist.googleVisionScores.length
      : normalizedGV;
    
    const avgNormalizedLPIPS = (artist.lpipsScores.length - 1) > 0
      ? artist.lpipsScores.reduce((a, b) => a + Math.min(b / 0.5, 1), 0) / artist.lpipsScores.length
      : normalizedLPIPS;

    // Hybrid calculation
    artist.strength = (avgNormalizedGV * 0.33) + (avgNormalizedLPIPS * 0.67);
    
    // Assign strength label
    if (artist.strength <= 0.33) {
      artist.strengthLabel = 'weak';
    } else if (artist.strength <= 0.66) {
      artist.strengthLabel = 'medium';
    } else {
      artist.strengthLabel = 'strong';
    }

    // Update confidence based on number of image pairs
    const imageCount = artist.lpipsScores.length;
    if (imageCount === 1) {
      artist.confidence = 60;
    } else if (imageCount === 3) {
      artist.confidence = 80;
    } else if (imageCount >= 5) {
      artist.confidence = 95;
    } else {
      artist.confidence = 60 + ((imageCount - 1) * 10);
    }

    artist.imagesCount = imageCount;
    artist.validationStatus = 'validated';
    artist.lastUpdated = new Date().toISOString();

    registry.artists[registry.artists.findIndex(a => a.id === artistId)] = artist;
    this.saveRegistry(folderPath, registry);

    return artist;
  }

  /**
   * Get detailed analysis for an artist
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistId - Artist ID
   * @returns {object} Detailed analysis data
   */
  getAnalysisDetails(folderPath, artistId) {
    const artist = this.getArtist(folderPath, artistId);
    
    return {
      artistId: artist.id,
      artistName: artist.name,
      totalImagePairs: artist.lpipsScores.length,
      lpipsScores: artist.lpipsScores,
      googleVisionScores: artist.googleVisionScores,
      averageLPIPS: artist.lpipsScores.length > 0 
        ? artist.lpipsScores.reduce((a, b) => a + b, 0) / artist.lpipsScores.length
        : 0,
      averageGoogleVision: artist.googleVisionScores.length > 0
        ? artist.googleVisionScores.reduce((a, b) => a + b, 0) / artist.googleVisionScores.length
        : 0,
      finalStrength: artist.strength,
      strengthLabel: artist.strengthLabel,
      confidence: artist.confidence,
      validationStatus: artist.validationStatus,
      lastUpdated: artist.lastUpdated,
      imagePairs: this.getImagePairsList(folderPath, artist.name)
    };
  }

  /**
   * Get list of image pairs for an artist
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistName - Artist name
   * @returns {array} Array of image pair info
   */
  getImagePairsList(folderPath, artistName) {
    const artistFolderPath = path.join(folderPath, artistName);
    const metadataPath = path.join(artistFolderPath, 'metadata.json');

    try {
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        // Convert relative or just-filename paths to full paths
        if (metadata.pairs && Array.isArray(metadata.pairs)) {
          return metadata.pairs.map(pair => {
            // Handle both old format (just filename) and new format (with subdirectory)
            let withArtistPath = pair.withArtistImage;
            let basePath = pair.baseImage;
            
            // If path doesn't include subdirectory, assume it's in with_artist/base folders
            if (withArtistPath && !withArtistPath.includes('/')) {
              withArtistPath = `with_artist/${withArtistPath}`;
            }
            if (basePath && !basePath.includes('/')) {
              basePath = `base/${basePath}`;
            }
            
            return {
              ...pair,
              baseImage: path.join(artistFolderPath, basePath),
              withArtistImage: path.join(artistFolderPath, withArtistPath)
            };
          });
        }
        return metadata.pairs || [];
      }
      
      // Fallback: Look for images in with_artist folder if metadata doesn't exist
      const withArtistPath = path.join(artistFolderPath, 'with_artist');
      if (fs.existsSync(withArtistPath)) {
        const images = fs.readdirSync(withArtistPath)
          .filter(f => {
            const filePath = path.join(withArtistPath, f);
            return fs.statSync(filePath).isFile();
          })
          .sort();
        
        // Return discovered images as pairs
        return images.map((img, idx) => ({
          id: `fallback_${idx}`,
          uploadedAt: new Date().toISOString(),
          baseImage: '', // Not available in fallback mode
          withArtistImage: path.join(artistFolderPath, 'with_artist', img),
          lpipsScore: 0,
          googleVisionScore: 0,
          status: 'discovered'
        }));
      }
    } catch (error) {
      console.error('Error reading image pairs metadata:', error);
    }

    return [];
  }

  /**
   * Save image pair metadata
   * @param {string} folderPath - Path to registry folder
   * @param {string} artistName - Artist name
   * @param {object} pairData - Pair metadata
   */
  saveImagePairMetadata(folderPath, artistName, pairData) {
    const artistFolderPath = path.join(folderPath, artistName);
    const metadataPath = path.join(artistFolderPath, 'metadata.json');

    try {
      let metadata = { pairs: [] };
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }

      metadata.pairs.push({
        id: uuidv4(),
        uploadedAt: new Date().toISOString(),
        baseImage: pairData.baseImage,
        withArtistImage: pairData.withArtistImage,
        lpipsScore: pairData.lpipsScore,
        googleVisionScore: pairData.googleVisionScore,
        status: pairData.status || 'pending'
      });

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving image pair metadata:', error);
      throw error;
    }
  }
}

module.exports = ArtistRegistryService;
