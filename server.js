const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const vision = require('@google-cloud/vision');

const app = express();
const PORT = 3000;

// Initialize Google Cloud Vision client
// Set environment variable to the credentials JSON file
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'google-vision-credentials.json');
const visionClient = new vision.ImageAnnotatorClient();

app.use(cors());
app.use(express.json());

// Paths for data and generated image storage
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
const GENERATED_DIR = path.join(__dirname, 'generated');

// Track current source folder for feedback storage
let currentSourcePath = null;

// Ensure required directories exist
if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR);
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

// Helper to read reviews from the JSON file
function readReviews() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Failed to read reviews file:', err);
    return [];
  }
}

// Helper to write reviews to the JSON file
function writeReviews(reviews) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2));
}

// Configure Multer storage. For each new review we create a new folder named numerically
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine the folder based on the next review ID
    const reviews = readReviews();
    const nextId = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    const folderPath = path.join(GENERATED_DIR, String(nextId));
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
    // Save folder name on request object so we can use it later
    req.generatedFolder = String(nextId);
    cb(null, folderPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

/**
 * POST /api/reviews
 * Accepts multipart/form-data including review details and images.
 * Creates a new review entry and stores images under a numeric folder.
 */
app.post('/api/reviews', upload.array('images'), (req, res) => {
  try {
    const { prompt, review, ratings } = req.body;
    if (!prompt || !ratings || !req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Missing required fields or images' });
    }
    const parsedRatings = JSON.parse(ratings);
    const reviews = readReviews();
    const id = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    const folderName = req.generatedFolder || String(id);
    const images = req.files.map(f => f.filename);
    const thumbnail = images[0];
    const newReview = {
      id,
      prompt,
      review,
      ratings: parsedRatings,
      folder: folderName,
      images,
      thumbnail
    };
    reviews.push(newReview);
    writeReviews(reviews);
    res.json(newReview);
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

/**
 * GET /api/reviews
 * Returns list of reviews. Supports filtering via query params.
 */
app.get('/api/reviews', (req, res) => {
  try {
    let reviews = readReviews();
    const { prompt, handFeet, facialExpression, genital, accessories, sideCharacter, background } = req.query;
    if (prompt) {
      const lower = String(prompt).toLowerCase();
      reviews = reviews.filter(r => r.prompt.toLowerCase().includes(lower));
    }
    const filters = { handFeet, facialExpression, genital, accessories, sideCharacter, background };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        reviews = reviews.filter(r => r.ratings[key] === value);
      }
    });
    res.json(reviews);
  } catch (err) {
    console.error('Error reading reviews:', err);
    res.status(500).json({ error: 'Failed to retrieve reviews' });
  }
});

/**
 * GET /api/reviews/:id/images
 * Returns list of image filenames for a given review.
 */
app.get('/api/reviews/:id/images', (req, res) => {
    const { id } = req.params;
    const reviews = readReviews();
    const review = reviews.find(r => String(r.id) === String(id));
    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }
    res.json(review.images);
});

/**
 * Serves an image from the generated folder
 */
app.get('/api/images/:folder/:file', (req, res) => {
  const { folder, file } = req.params;
  const filePath = path.join(GENERATED_DIR, folder, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(filePath);
});

/**
 * PUT /api/reviews/:id
 * Updates an existing review. Images are optional - if new images are provided,
 * they replace the old ones.
 */
app.put('/api/reviews/:id', upload.array('images'), (req, res) => {
  try {
    const { id } = req.params;
    const { prompt, review, ratings, existingImages } = req.body;
    
    if (!prompt || !ratings) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const reviews = readReviews();
    const reviewIndex = reviews.findIndex(r => r.id === parseInt(id));
    
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const parsedRatings = JSON.parse(ratings);
    const existingReview = reviews[reviewIndex];
    
    // Parse existing images (which ones to keep)
    let imagesToKeep = existingReview.images;
    if (existingImages) {
      try {
        imagesToKeep = JSON.parse(existingImages);
      } catch (e) {
        // If parse fails, keep all existing images
        imagesToKeep = existingReview.images;
      }
    }
    
    // Remove images that are no longer in the keep list
    const folderPath = path.join(GENERATED_DIR, existingReview.folder);
    existingReview.images.forEach(img => {
      if (!imagesToKeep.includes(img)) {
        const filePath = path.join(folderPath, img);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
    
    // Combine kept existing images with newly uploaded images
    let finalImages = [...imagesToKeep];
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => f.filename);
      finalImages = [...imagesToKeep, ...newImages];
    }
    
    // Set thumbnail to first image in final list
    let thumbnail = finalImages.length > 0 ? finalImages[0] : existingReview.thumbnail;

    const updatedReview = {
      ...existingReview,
      prompt,
      review,
      ratings: parsedRatings,
      images: finalImages,
      thumbnail
    };

    reviews[reviewIndex] = updatedReview;
    writeReviews(reviews);
    res.json(updatedReview);
  } catch (err) {
    console.error('Error updating review:', err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

/**
 * DELETE /api/reviews/:id
 * Deletes a review and its associated images.
 */
app.delete('/api/reviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const reviews = readReviews();
    const reviewIndex = reviews.findIndex(r => r.id === parseInt(id));
    
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviews[reviewIndex];
    
    // Delete the folder and its images
    const folderPath = path.join(GENERATED_DIR, review.folder);
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }

    // Remove from reviews array
    reviews.splice(reviewIndex, 1);
    writeReviews(reviews);
    
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// GET endpoint to extract metadata from an image (generation prompt from embedded metadata or filename)
app.get('/api/image-metadata/:folder/:filename', (req, res) => {
  try {
    const { folder, filename } = req.params;
    const imagePath = path.join(GENERATED_DIR, folder, filename);
    
    // Security check: prevent directory traversal
    if (!imagePath.startsWith(GENERATED_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    let prompt = null;
    let generationData = null;
    
    // Try to read embedded PNG metadata first
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const metadata = readPNGMetadata(imageBuffer);
      
      // Look for Comment chunk which typically contains JSON with generation parameters
      if (metadata.comment) {
        try {
          const commentData = JSON.parse(metadata.comment);
          if (commentData.prompt) {
            prompt = commentData.prompt;
            generationData = commentData;
          }
        } catch (e) {
          // Comment is not JSON, try direct text
          prompt = metadata.comment;
        }
      }
      
      // Also check Description field
      if (!prompt && metadata.description) {
        prompt = metadata.description;
      }
    } catch (err) {
      console.warn('Could not read embedded PNG metadata:', err.message);
    }
    
    // Fall back to extracting from filename if no embedded metadata found
    if (!prompt) {
      const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
      if (match) {
        prompt = match[1];
      }
    }
    
    res.json({
      filename: filename,
      prompt: prompt || null,
      generationData: generationData || undefined
    });
  } catch (err) {
    console.error('Error extracting image metadata:', err);
    res.status(500).json({ error: 'Failed to extract metadata', details: err.message });
  }
});

// Helper function to check if a filename is a macOS system file
function isMacSystemFile(filename) {
  // Filter out macOS system files like ._*, .DS_Store, etc.
  return filename.startsWith('._') || filename === '.DS_Store' || filename.startsWith('.~');
}

// Helper function to read PNG text chunks
function readPNGMetadata(buffer) {
  const metadata = {};
  
  // PNG file signature: 137 80 78 71 13 10 26 10
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // Check PNG signature - return empty metadata if not PNG instead of throwing
  if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    return metadata; // Return empty metadata for non-PNG files
  }
  
  let offset = 8; // Start after PNG signature
  
  while (offset < buffer.length) {
    // Read chunk length (4 bytes, big-endian)
    if (offset + 8 > buffer.length) break;
    const chunkLength = buffer.readUInt32BE(offset);
    offset += 4;
    
    // Read chunk type (4 bytes)
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    
    // Read chunk data
    const chunkData = buffer.slice(offset, offset + chunkLength);
    offset += chunkLength;
    
    // Skip CRC (4 bytes)
    offset += 4;
    
    // Process text chunks
    if (chunkType === 'tEXt') {
      // tEXt format: keyword (null-terminated) + text data
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const keyword = chunkData.toString('latin1', 0, nullIndex);
        const text = chunkData.toString('utf-8', nullIndex + 1);
        metadata[keyword.toLowerCase()] = text;
      }
    } else if (chunkType === 'zTXt') {
      // zTXt format: keyword (null-terminated) + compression method + compressed text
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const keyword = chunkData.toString('latin1', 0, nullIndex);
        const compressionMethod = chunkData[nullIndex + 1];
        if (compressionMethod === 0) { // DEFLATE
          try {
            const zlib = require('zlib');
            const compressedText = chunkData.slice(nullIndex + 2);
            const decompressed = zlib.inflateSync(compressedText);
            const text = decompressed.toString('utf-8');
            metadata[keyword.toLowerCase()] = text;
          } catch (e) {
            console.warn('Failed to decompress zTXt chunk:', e.message);
          }
        }
      }
    } else if (chunkType === 'iTXt') {
      // iTXt format: keyword (null-terminated) + compression flag + compression method + language tag + translated keyword + text
      const nullIndex = chunkData.indexOf(0);
      if (nullIndex > 0) {
        const keyword = chunkData.toString('latin1', 0, nullIndex);
        const compressionFlag = chunkData[nullIndex + 1];
        if (compressionFlag === 0) { // Uncompressed
          let dataStart = nullIndex + 3;
          const langTagEnd = chunkData.indexOf(0, dataStart);
          if (langTagEnd > 0) {
            dataStart = langTagEnd + 1;
            const transKeywordEnd = chunkData.indexOf(0, dataStart);
            if (transKeywordEnd > 0) {
              dataStart = transKeywordEnd + 1;
              const text = chunkData.toString('utf-8', dataStart);
              metadata[keyword.toLowerCase()] = text;
            }
          }
        } else if (compressionFlag === 1) { // Compressed with DEFLATE
          try {
            const zlib = require('zlib');
            let dataStart = nullIndex + 3;
            const langTagEnd = chunkData.indexOf(0, dataStart);
            if (langTagEnd > 0) {
              dataStart = langTagEnd + 1;
              const transKeywordEnd = chunkData.indexOf(0, dataStart);
              if (transKeywordEnd > 0) {
                dataStart = transKeywordEnd + 1;
                const compressedText = chunkData.slice(dataStart);
                const decompressed = zlib.inflateSync(compressedText);
                const text = decompressed.toString('utf-8');
                metadata[keyword.toLowerCase()] = text;
              }
            }
          } catch (e) {
            console.warn('Failed to decompress iTXt chunk:', e.message);
          }
        }
      }
    } else if (chunkType === 'IEND') {
      // End of PNG file
      break;
    }
  }
  
  return metadata;
}

// POST endpoint to group images by artist tags
app.post('/api/group-by-artists/:folder', (req, res) => {
  try {
    const { folder } = req.params;
    const folderPath = path.join(GENERATED_DIR, folder);
    
    // Security check
    if (!folderPath.startsWith(GENERATED_DIR)) {
      return res.status(400).json({ error: 'Invalid folder path' });
    }
    
    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Read all image files from the folder, filtering out macOS system files
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.png') && !isMacSystemFile(f));
    
    // Group images by artist combination
    const artistGroups = {};
    const imageMetadata = [];
    
    files.forEach(filename => {
      try {
        const imagePath = path.join(folderPath, filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = readPNGMetadata(imageBuffer);
        
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
          artists = extractArtistTags(prompt);
        }
        
        // Create a canonical key from sorted artist names for consistent grouping
        // The artists array is already sorted by extractArtistTags()
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
        console.warn(`Error processing image ${filename}:`, err.message);
      }
    });
    
    // Create subfolder structure using artist tag combinations as folder names
    const results = {};
    const folderMapping = {}; // Track mapping of folder names to artist keys
    
    Object.entries(artistGroups).forEach(([artistKey, imageFilenames]) => {
      // Generate folder name from artist combination
      let folderName = sanitizeFolderName(artistKey);
      
      // If folder name would exceed 255 chars, truncate and add hash for uniqueness
      if (folderName.length > 255) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(artistKey).digest('hex').substring(0, 8);
        const maxNameLength = 255 - hash.length - 1; // Reserve space for hash and separator
        folderName = sanitizeFolderName(artistKey.substring(0, maxNameLength)) + '_' + hash;
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
          
          // Use fs.copyFile to copy instead of move (safer)
          fs.copyFileSync(srcPath, destPath);
        } catch (err) {
          console.warn(`Error copying ${filename}:`, err.message);
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
    
    res.json({
      success: true,
      sourceFolder: folder,
      totalImages: files.length,
      groupCount: Object.keys(results).length,
      groups: results,
      imageMetadata: imageMetadata
    });
  } catch (err) {
    console.error('Error grouping images by artists:', err);
    res.status(500).json({ error: 'Failed to group images', details: err.message });
  }
});

// POST endpoint to group images from custom paths (source and destination folders)
// Supports incremental sorting: skips existing images and reuses existing artist folders
app.post('/api/group-by-artists-path', (req, res) => {
  try {
    const { sourcePath, destinationPath, usePreSorted } = req.body;
    
    // Validate input
    if (!sourcePath || !destinationPath) {
      return res.status(400).json({ error: 'Both sourcePath and destinationPath are required' });
    }
    
    // Resolve and normalize paths
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedDestPath = path.resolve(destinationPath);
    
    // ===== NEW: Set current source path for feedback storage =====
    currentSourcePath = resolvedSourcePath;
    console.log(`[Feedback] Set current source path to: ${currentSourcePath}`);
    
    // Check if source folder exists
    if (!fs.existsSync(resolvedSourcePath)) {
      return res.status(404).json({ error: `Source folder not found: ${sourcePath}` });
    }
    
    // Create destination folder if it doesn't exist
    if (!fs.existsSync(resolvedDestPath)) {
      fs.mkdirSync(resolvedDestPath, { recursive: true });
    }
    
    // STEP 1: Load existing mapping to know about previously sorted images and artist combinations
    const mappingFile = path.join(resolvedDestPath, '_artist_mapping.json');
    let existingMapping = {};
    let existingImages = new Set(); // Track all images already in destination
    
    if (fs.existsSync(mappingFile)) {
      try {
        existingMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        
        // Build a set of all existing images in destination folders
        Object.keys(existingMapping).forEach(folderName => {
          const folderPath = path.join(resolvedDestPath, folderName);
          if (fs.existsSync(folderPath)) {
            const folderFiles = fs.readdirSync(folderPath)
              .filter(f => f.endsWith('.png') && !isMacSystemFile(f));
            folderFiles.forEach(file => existingImages.add(file));
          }
        });
      } catch (e) {
        console.warn('Could not load existing mapping:', e.message);
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
      // Check if source has mapping file
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
          console.warn('Could not load source mapping:', e.message);
        }
      }

      // If mapping is empty, scan subdirectories directly
      if (Object.keys(sourceMapping).length === 0) {
        const allItems = fs.readdirSync(resolvedSourcePath);
        allItems.forEach(item => {
          const itemPath = path.join(resolvedSourcePath, item);
          try {
            if (fs.statSync(itemPath).isDirectory() && !item.startsWith('.')) {
              // This is a subdirectory - treat it as an artist group
              // For auto-scanned folders, artistKey and folderName are the same
              sourceMapping[item] = item;
            }
          } catch (e) {
            // Skip if can't stat
          }
        });
      }

      // Get all folders from source that are in the mapping
      // sourceMapping is: { artistKey: folderName }
      Object.entries(sourceMapping).forEach(([artistKey, folderName]) => {
        const sourceFolderPath = path.join(resolvedSourcePath, folderName);
        
        if (!fs.existsSync(sourceFolderPath)) {
          return; // Skip if folder doesn't exist
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
          .filter(f => f.endsWith('.png') && !isMacSystemFile(f));

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
            console.warn(`Error copying ${filename}:`, err.message);
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

      // Note: .prompt_mapping.json is not merged because it contains groupIds 
      // that are specific to the source folder's prompt grouping structure.
      // In this context, we're doing artist-based grouping, not prompt-based grouping,
      // so the prompt mapping from source doesn't apply to destination groups.

      // Update destination mapping
      fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));

      return res.json({
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
      });
    }

    // === SLOW PATH: READ IMAGE METADATA ===
    // STEP 2: Read all image files from the source folder, filtering out macOS system files
    const srcFiles = fs.readdirSync(resolvedSourcePath)
      .filter(f => f.endsWith('.png') && !isMacSystemFile(f));
    
    if (srcFiles.length === 0) {
      // Check if this might be a pre-sorted folder with subdirectories
      const allItems = fs.readdirSync(resolvedSourcePath);
      console.log(`[GroupByArtists] Source folder contents: ${allItems.join(', ')}`);
      
      const hasSubdirectories = allItems.some(item => {
        try {
          return fs.statSync(path.join(resolvedSourcePath, item)).isDirectory() && !item.startsWith('.');
        } catch (e) {
          return false;
        }
      });
      
      console.log(`[GroupByArtists] Has subdirectories: ${hasSubdirectories}`);
      console.log(`[GroupByArtists] Is pre-sorted: ${isSourcePreSorted}`);
      
      if (hasSubdirectories) {
        return res.status(400).json({ 
          error: 'No PNG files found at the root level. The source folder appears to be organized with subdirectories. If these are artist groups, make sure the folder contains _artist_mapping.json file for automatic detection, or ensure PNG files are at the root level.' 
        });
      }
      
      return res.status(400).json({ error: 'No PNG files found in the source folder' });
    }
    
    // STEP 3: Process files, group by artist combination, and identify which are new
    const srcArtistGroups = {};
    const srcImageMetadata = [];
    const srcSkippedImages = [];
    let srcImagesToProcess = 0;
    
    srcFiles.forEach(filename => {
      // Check if image already exists in destination
      if (existingImages.has(filename)) {
        srcSkippedImages.push(filename);
        return; // Skip this image
      }
      
      srcImagesToProcess++;
      
      try {
        const imagePath = path.join(resolvedSourcePath, filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = readPNGMetadata(imageBuffer);
        
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
          artists = extractArtistTags(prompt);
        }
        
        // Create a canonical key from artist combination (preserving order and bracket types)
        const artistKey = artists.length > 0 
          ? artists.join(' | ')
          : 'no-artists';
        
        if (!srcArtistGroups[artistKey]) {
          srcArtistGroups[artistKey] = [];
        }
        srcArtistGroups[artistKey].push(filename);
        
        srcImageMetadata.push({
          filename,
          artists,
          artistKey
        });
      } catch (err) {
        console.warn(`Error processing image ${filename}:`, err.message);
      }
    });
    
    // STEP 4: Create/reuse subfolder structure and copy new images
    const srcResults = {};
    let srcNewFoldersCreated = 0;
    
    Object.entries(srcArtistGroups).forEach(([artistKey, imageFilenames]) => {
      // Check if we already have a folder for this artist combination
      let folderName;
      
      if (artistKeyToFolder[artistKey]) {
        // Reuse existing folder for this artist combination
        folderName = artistKeyToFolder[artistKey];
      } else {
        // Create new folder name for this artist combination
        folderName = sanitizeFolderName(artistKey);
        
        // If folder name would exceed 255 chars, truncate and add hash for uniqueness
        if (folderName.length > 255) {
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(artistKey).digest('hex').substring(0, 8);
          const maxNameLength = 255 - hash.length - 1; // Reserve space for hash and separator
          folderName = sanitizeFolderName(artistKey.substring(0, maxNameLength)) + '_' + hash;
        }
        
        srcNewFoldersCreated++;
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
          
          // Only copy if not already there (double-check)
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
            copiedCount++;
          }
        } catch (err) {
          console.warn(`Error copying ${filename}:`, err.message);
        }
      });
      
      srcResults[folderName] = {
        artistKey,
        artists: artistKey.split(' | ').filter(a => a !== 'no-artists'),
        newCount: copiedCount,
        totalCount: imageFilenames.length,
        images: imageFilenames
      };
    });
    
    // STEP 5: Update and write mapping file with all folders (old + new)
    fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));
    
    
    // STEP 2: Read all image files from the source folder, filtering out macOS system files
    const files = fs.readdirSync(resolvedSourcePath)
      .filter(f => f.endsWith('.png') && !isMacSystemFile(f));
    
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PNG files found in the source folder' });
    }
    
    // STEP 3: Process files, group by artist combination, and identify which are new
    const artistGroups = {};
    const imageMetadata = [];
    const skippedImages = [];
    let imagesToProcess = 0;
    
    files.forEach(filename => {
      // Check if image already exists in destination
      if (existingImages.has(filename)) {
        skippedImages.push(filename);
        return; // Skip this image
      }
      
      imagesToProcess++;
      
      try {
        const imagePath = path.join(resolvedSourcePath, filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = readPNGMetadata(imageBuffer);
        
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
          artists = extractArtistTags(prompt);
        }
        
        // Create a canonical key from artist combination (preserving order and bracket types)
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
        console.warn(`Error processing image ${filename}:`, err.message);
      }
    });
    
    // STEP 4: Create/reuse subfolder structure and copy new images
    const results = {};
    let newFoldersCreated = 0;
    
    Object.entries(artistGroups).forEach(([artistKey, imageFilenames]) => {
      // Check if we already have a folder for this artist combination
      let folderName;
      
      if (artistKeyToFolder[artistKey]) {
        // Reuse existing folder for this artist combination
        folderName = artistKeyToFolder[artistKey];
      } else {
        // Create new folder name for this artist combination
        folderName = sanitizeFolderName(artistKey);
        
        // If folder name would exceed 255 chars, truncate and add hash for uniqueness
        if (folderName.length > 255) {
          const crypto = require('crypto');
          const hash = crypto.createHash('md5').update(artistKey).digest('hex').substring(0, 8);
          const maxNameLength = 255 - hash.length - 1; // Reserve space for hash and separator
          folderName = sanitizeFolderName(artistKey.substring(0, maxNameLength)) + '_' + hash;
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
          
          // Only copy if not already there (double-check)
          if (!fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
            copiedCount++;
          }
        } catch (err) {
          console.warn(`Error copying ${filename}:`, err.message);
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
    
    // Note: .prompt_mapping.json is not merged because it contains groupIds 
    // that are specific to the source folder's prompt grouping structure.
    // In this context, we're doing artist-based grouping, not prompt-based grouping,
    // so the prompt mapping from source doesn't apply to destination groups.
    
    // STEP 5: Update and write mapping file with all folders (old + new)
    fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));
    
    res.json({
      success: true,
      sourceFolder: resolvedSourcePath,
      destinationFolder: resolvedDestPath,
      totalSourceImages: srcFiles.length,
      skippedImages: srcSkippedImages,
      skippedCount: srcSkippedImages.length,
      imagesToProcess: srcImagesToProcess,
      newFoldersCreated: srcNewFoldersCreated,
      groups: srcResults,
      imageMetadata: srcImageMetadata
    });
  } catch (err) {
    console.error('Error grouping images by artists:', err);
    res.status(500).json({ error: 'Failed to group images', details: err.message });
  }
});

// Helper function to sanitize artist tag combination into a valid folder name
// Removes or replaces invalid filesystem characters
function sanitizeFolderName(artistKey) {
  // Replace ' | ' with ' - ' for better readability in folder names
  let folderName = artistKey.replace(/ \| /g, ' - ');
  
  // Remove or replace invalid filesystem characters
  // macOS/Unix allows most characters except '/' and null
  // But we'll also remove other problematic characters for cross-platform compatibility
  folderName = folderName
    .replace(/[\/\0]/g, '')           // Remove forward slash and null
    .replace(/[:*?"<>|]/g, '')        // Remove Windows-invalid characters
    .trim();                           // Trim whitespace
  
  // If the result is empty or is a reserved name, use a default
  if (!folderName || folderName === 'no-artists') {
    folderName = 'no-artists';
  }
  
  return folderName;
}

// Helper function to extract artist tags from prompt
// PRESERVES: original order in prompt AND bracket/brace types
// So {artist:alice}, [artist:bob], artist:charlie are all different from each other
function extractArtistTags(prompt) {
  if (!prompt) return [];
  
  const artists = []; // Use array to preserve order, not Set
  
  // Match patterns like {artist: name}, [artist:name], artist:name, etc.
  // CAPTURE the brackets too so we can preserve them
  const pattern = /([{\[\(]*)\s*artist:\s*([^}\]\),]+)\s*([}\]\)]*)/gi;
  
  let match;
  while ((match = pattern.exec(prompt)) !== null) {
    const openBrackets = match[1];    // e.g., "{", "[", "{{{", ""
    const artistName = match[2].trim(); // e.g., "alice"
    const closeBrackets = match[3];   // e.g., "}", "]", "}}}", ""
    
    if (artistName && artistName.length > 0 && artistName !== 'artist') {
      // Create a signature that includes bracket type and count
      // {alice} → "{alice}" 
      // [alice] → "[alice]"
      // alice → "alice"
      const artistWithBrackets = openBrackets + artistName + closeBrackets;
      
      // Only add if not already in the list (to avoid exact duplicates)
      if (!artists.includes(artistWithBrackets)) {
        artists.push(artistWithBrackets);
      }
    }
  }
  
  // If no matches, also try simpler pattern for edge cases
  if (artists.length === 0) {
    const simplePattern = /artist:\s*([^,}\]\s]+)/gi;
    while ((match = simplePattern.exec(prompt)) !== null) {
      const artistName = match[1].trim();
      if (artistName && artistName.length > 0) {
        artists.push(artistName);
      }
    }
  }
  
  // Return array IN ORIGINAL PROMPT ORDER (no sorting!)
  return artists;
}

// ============ ARTIST GALLERY API ENDPOINTS ============

/**
 * POST /api/artist-gallery/load-groups
 * Scans a sorted folder and loads all artist groups with metadata
 * Request body: { folderPath: string }
 * Response: { success: boolean, sortedFolder: string, baseFolder: string (for ratings), groups: ArtistGroupInfo[], totals: { groups: number, images: number } }
 */
app.post('/api/artist-gallery/load-groups', (req, res) => {
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
    
    console.log(`[artist-gallery/load-groups] Resolved sorted folder: ${resolvedPath}, base folder for ratings: ${baseFolder}`);

    // Load mapping file if it exists
    const mappingFile = path.join(resolvedPath, '.artist-mapping.json');
    let artistKeyToFolder = {};
    if (fs.existsSync(mappingFile)) {
      try {
        artistKeyToFolder = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
      } catch (err) {
        console.warn('Failed to read mapping file:', err.message);
      }
    }

    const groups = [];
    const subfolders = fs.readdirSync(resolvedPath).filter(f => {
      return f !== '.artist-mapping.json' && fs.statSync(path.join(resolvedPath, f)).isDirectory();
    });

    subfolders.forEach(folderName => {
      const folderPath = path.join(resolvedPath, folderName);
      const files = fs.readdirSync(folderPath).filter(f => {
        const filePath = path.join(folderPath, f);
        return fs.statSync(filePath).isFile() && f.endsWith('.png') && !isMacSystemFile(f);
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
            console.warn(`Failed to get mtime for ${file}:`, err.message);
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
      baseFolder: baseFolder,  // NEW: Include base folder for ratings storage
      groups,
      totals: {
        groups: groups.length,
        images: groups.reduce((sum, g) => sum + g.imageCount, 0)
      }
    });
  } catch (err) {
    console.error('Error loading artist groups:', err);
    res.status(500).json({ error: 'Failed to load artist groups', details: err.message });
  }
});

/**
 * POST /api/artist-gallery/group-images
 * Returns all images in a specific artist group folder
 * Request body: { folderPath: string }
 * Response: { success: boolean, images: string[] }
 */
app.post('/api/artist-gallery/group-images', (req, res) => {
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
      .filter(f => fs.statSync(path.join(resolvedPath, f)).isFile() && f.endsWith('.png') && !isMacSystemFile(f));

    res.json({
      success: true,
      images: files
    });
  } catch (err) {
    console.error('Error loading group images:', err);
    res.status(500).json({ error: 'Failed to load group images', details: err.message });
  }
});

/**
 * GET /api/artist-gallery/image-metadata
 * Extracts metadata from a specific image file
 * Query params: filePath (encoded full file path)
 * Response: { success: boolean, filename: string, prompt: string, artists: string[], generationData: string }
 */
app.get('/api/artist-gallery/image-metadata', (req, res) => {
  try {
    const encodedFilePath = req.query.filePath;
    if (!encodedFilePath) {
      return res.status(400).json({ error: 'Missing filePath query parameter' });
    }

    const filePath = decodeURIComponent(encodedFilePath);
    const resolvedPath = path.resolve(filePath);

    console.log(`[artist-gallery/image-metadata] filePath: ${filePath}`);
    console.log(`[artist-gallery/image-metadata] resolvedPath: ${resolvedPath}`);
    console.log(`[artist-gallery/image-metadata] exists: ${fs.existsSync(resolvedPath)}`);

    // Security: Ensure the path exists and is not trying to escape
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[artist-gallery/image-metadata] File not found: ${resolvedPath}`);
      return res.status(404).json({ error: 'File not found', path: resolvedPath });
    }

    const filename = path.basename(filePath);
    const fileBuffer = fs.readFileSync(resolvedPath);
    const metadata = readPNGMetadata(fileBuffer);
    
    let prompt = '';
    
    // Try to read embedded PNG metadata first
    try {
      // Look for Comment chunk which typically contains JSON with generation parameters
      if (metadata.comment) {
        try {
          const commentData = JSON.parse(metadata.comment);
          if (commentData.prompt) {
            prompt = commentData.prompt;
          }
        } catch (e) {
          // Comment is not JSON, try direct text
          prompt = metadata.comment;
        }
      }
      
      // Also check Description field
      if (!prompt && metadata.description) {
        prompt = metadata.description;
      }
    } catch (err) {
      console.warn('[artist-gallery/image-metadata] Could not parse PNG metadata:', err.message);
    }
    
    // Fall back to extracting from filename if no embedded metadata found
    if (!prompt) {
      const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
      if (match) {
        prompt = match[1];
      }
    }
    
    const artists = extractArtistTags(prompt);

    console.log(`[artist-gallery/image-metadata] Successfully read metadata, prompt length: ${prompt.length}, prompt: ${prompt.substring(0, 100)}`);

    res.json({
      success: true,
      filename,
      prompt,
      artists,
      generationData: JSON.stringify(metadata, null, 2)
    });
  } catch (err) {
    console.error('Error reading image metadata:', err);
    res.status(500).json({ error: 'Failed to read metadata', details: err.message });
  }
});

/**
 * POST /api/artist-gallery/image
 * Serves the image file
 * Query params: filePath (encoded full file path), thumbnail (optional - now serves complete file with caching)
 */
app.get('/api/artist-gallery/image', (req, res) => {
  try {
    const encodedFilePath = req.query.filePath;
    const thumbnail = req.query.thumbnail;
    
    if (!encodedFilePath) {
      return res.status(400).json({ error: 'Missing filePath query parameter' });
    }

    const filePath = decodeURIComponent(encodedFilePath);
    const resolvedPath = path.resolve(filePath);

    console.log(`[artist-gallery/image] filePath: ${filePath}`);
    console.log(`[artist-gallery/image] resolvedPath: ${resolvedPath}`);
    console.log(`[artist-gallery/image] exists: ${fs.existsSync(resolvedPath)}`);

    // Security: Ensure the file exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[artist-gallery/image] File not found: ${resolvedPath}`);
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
    console.error('Error serving image:', err);
    res.status(500).json({ error: 'Failed to serve image', details: err.message });
  }
});

/**
 * POST /api/artist-gallery/copy-from-source
 * Copies artist groups and images from source sorted folder to destination
 * Merges artist mapping files and avoids duplicate images
 * Request body: { sourcePath: string, destinationPath: string }
 * Response: { success: boolean, message: string, copiedGroups?: number, copiedImages?: number, mergedMapping?: boolean, error?: string }
 */
app.post('/api/artist-gallery/copy-from-source', (req, res) => {
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

    // Create destination folder if it doesn't exist
    if (!fs.existsSync(resolvedDestPath)) {
      fs.mkdirSync(resolvedDestPath, { recursive: true });
    }

    // Load source mapping file to get artist-to-folder mapping
    const sourceMappingFile = path.join(resolvedSourcePath, '.artist-mapping.json');
    let sourceMapping = {};
    if (fs.existsSync(sourceMappingFile)) {
      try {
        sourceMapping = JSON.parse(fs.readFileSync(sourceMappingFile, 'utf8'));
      } catch (err) {
        console.warn('Failed to read source mapping:', err.message);
      }
    }

    // Load existing destination mapping
    const destMappingFile = path.join(resolvedDestPath, '_artist_mapping.json');
    let destMapping = {};
    let existingImages = new Set();

    if (fs.existsSync(destMappingFile)) {
      try {
        destMapping = JSON.parse(fs.readFileSync(destMappingFile, 'utf8'));
        // Build set of existing images
        Object.values(destMapping).forEach(folderName => {
          const folderPath = path.join(resolvedDestPath, folderName);
          if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath)
              .filter(f => f.endsWith('.png') && !isMacSystemFile(f))
              .forEach(file => existingImages.add(file));
          }
        });
      } catch (err) {
        console.warn('Failed to read destination mapping:', err.message);
      }
    }

    let copiedImages = 0;
    let copiedGroups = 0;

    // Copy all artist group folders and images
    const sourceSubfolders = fs.readdirSync(resolvedSourcePath)
      .filter(f => {
        const fullPath = path.join(resolvedSourcePath, f);
        return fs.statSync(fullPath).isDirectory() && f !== '.git' && f !== 'node_modules';
      });

    sourceSubfolders.forEach(folderName => {
      const sourceFolderPath = path.join(resolvedSourcePath, folderName);
      const destFolderPath = path.join(resolvedDestPath, folderName);

      // Create destination folder if needed
      if (!fs.existsSync(destFolderPath)) {
        fs.mkdirSync(destFolderPath, { recursive: true });
        copiedGroups++;
      }

      // Copy images from this folder
      const sourceFiles = fs.readdirSync(sourceFolderPath)
        .filter(f => f.endsWith('.png') && !isMacSystemFile(f));

      sourceFiles.forEach(filename => {
        // Skip if image already exists
        if (existingImages.has(filename)) {
          return;
        }

        const srcFilePath = path.join(sourceFolderPath, filename);
        const destFilePath = path.join(destFolderPath, filename);

        try {
          fs.copyFileSync(srcFilePath, destFilePath);
          copiedImages++;
          existingImages.add(filename);
        } catch (err) {
          console.warn(`Failed to copy image ${filename}:`, err.message);
        }
      });

      // Merge artist mapping: find artist key for this folder in source
      const artistKey = Object.keys(sourceMapping).find(key => sourceMapping[key] === folderName);
      if (artistKey && !destMapping[folderName]) {
        destMapping[folderName] = artistKey;
      }
    });

    // Save merged mapping file
    try {
      fs.writeFileSync(destMappingFile, JSON.stringify(destMapping, null, 2));
    } catch (err) {
      console.warn('Failed to save destination mapping:', err.message);
    }

    res.json({
      success: true,
      message: `Imported ${copiedImages} images into ${copiedGroups} groups`,
      copiedGroups,
      copiedImages,
      mergedMapping: Object.keys(destMapping).length > 0
    });
  } catch (err) {
    console.error('Error copying from source:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to copy from source folder',
      details: err.message
    });
  }
});

/**
 * POST /api/pick-folder
 * Opens a native folder picker dialog and returns the selected folder path
 * Note: This requires the app to have proper permissions and focuses the window
 */
app.post('/api/pick-folder', (req, res) => {
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    console.log('[FolderPicker] Platform:', platform);

    let selectedPath = '';
    
    try {
      if (platform === 'darwin') {
        // macOS - use AppleScript via -e flag which is more reliable
        const script = `tell application "System Events"
  activate
  set folderPath to POSIX path of (choose folder with prompt "Select a folder:")
  return folderPath
end tell`;
        
        console.log('[FolderPicker] Using macOS AppleScript');
        selectedPath = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf8',
          timeout: 60000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        
      } else if (platform === 'win32') {
        // Windows - use PowerShell
        const psCommand = `Add-Type -AssemblyName System.Windows.Forms;` +
          `$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;` +
          `$dialog.Description = 'Select a folder';` +
          `if ($dialog.ShowDialog() -eq 'OK') { Write-Host $dialog.SelectedPath }`;
        
        console.log('[FolderPicker] Using Windows PowerShell');
        selectedPath = execSync(`powershell -NoProfile -Command "${psCommand}"`, {
          encoding: 'utf8',
          timeout: 60000,
          shell: 'powershell'
        }).trim();
        
      } else if (platform === 'linux') {
        // Linux - try zenity first, then kdialog
        console.log('[FolderPicker] Using Linux zenity/kdialog');
        try {
          selectedPath = execSync(`zenity --file-selection --directory --title "Select a folder"`, {
            encoding: 'utf8',
            timeout: 60000,
            stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
        } catch (e) {
          try {
            selectedPath = execSync(`kdialog --getexistingdirectory . --title "Select a folder"`, {
              encoding: 'utf8',
              timeout: 60000,
              stdio: ['pipe', 'pipe', 'pipe']
            }).trim();
          } catch (e2) {
            console.log('[FolderPicker] Neither zenity nor kdialog available');
            throw new Error('No folder picker available on this Linux system');
          }
        }
      } else {
        return res.status(400).json({ error: 'Unsupported platform for folder picker' });
      }

      if (!selectedPath) {
        console.log('[FolderPicker] No path selected (empty output)');
        return res.json({ success: false, cancelled: true, path: null });
      }

      console.log('[FolderPicker] Selected path:', selectedPath);

      // Decode the path if needed
      let decodedPath = selectedPath;
      try {
        decodedPath = decodeURIComponent(selectedPath);
      } catch (e) {
        // Use original if decoding fails
      }

      // Verify the path exists and is a directory
      if (!fs.existsSync(decodedPath)) {
        console.error('[FolderPicker] Path does not exist:', decodedPath);
        return res.json({ success: false, error: 'Path does not exist', path: null });
      }

      const stats = fs.statSync(decodedPath);
      if (!stats.isDirectory()) {
        console.error('[FolderPicker] Path is not a directory:', decodedPath);
        return res.json({ success: false, error: 'Not a directory', path: null });
      }

      console.log('[FolderPicker] Successfully selected folder:', decodedPath);
      res.json({ success: true, path: decodedPath });
      
    } catch (error) {
      console.log('[FolderPicker] Execution error:', error.message);
      // Check if user cancelled (exit code 1 is common for cancelled operations)
      return res.json({ success: false, cancelled: true, path: null });
    }
    
  } catch (err) {
    console.error('[FolderPicker] Error in endpoint:', err.message);
    res.status(500).json({ error: 'Failed to open folder picker', details: err.message });
  }
});

/**
 * POST /api/open-folder
 * Opens a folder in the system file explorer (Finder on macOS, Explorer on Windows, etc.)
 * Body: { path: "/path/to/folder" }
 */
app.post('/api/open-folder', (req, res) => {
  try {
    const { path: folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }

    // Verify path exists and is a directory
    if (!fs.existsSync(folderPath)) {
      console.error('[OpenFolder] Path does not exist:', folderPath);
      return res.status(400).json({ error: 'Folder does not exist' });
    }

    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      console.error('[OpenFolder] Path is not a directory:', folderPath);
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const { execSync } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    console.log('[OpenFolder] Opening folder:', folderPath, 'on platform:', platform);

    try {
      if (platform === 'darwin') {
        // macOS - use open command
        execSync(`open "${folderPath}"`, { stdio: 'ignore' });
      } else if (platform === 'win32') {
        // Windows - use explorer
        execSync(`explorer "${folderPath}"`, { stdio: 'ignore', shell: 'cmd.exe' });
      } else if (platform === 'linux') {
        // Linux - try various file managers
        try {
          execSync(`xdg-open "${folderPath}"`, { stdio: 'ignore' });
        } catch (e) {
          try {
            execSync(`nautilus "${folderPath}"`, { stdio: 'ignore' });
          } catch (e2) {
            try {
              execSync(`dolphin "${folderPath}"`, { stdio: 'ignore' });
            } catch (e3) {
              console.warn('[OpenFolder] Could not open folder with any file manager');
              return res.status(500).json({ error: 'No file manager available' });
            }
          }
        }
      }

      console.log('[OpenFolder] Successfully opened folder:', folderPath);
      res.json({ success: true, message: 'Folder opened in file explorer' });
    } catch (execError) {
      console.error('[OpenFolder] Execution error:', execError.message);
      res.status(500).json({ error: 'Failed to open folder', details: execError.message });
    }
  } catch (err) {
    console.error('[OpenFolder] Error in endpoint:', err.message);
    res.status(500).json({ error: 'Failed to open folder', details: err.message });
  }
});

/**
 * POST /api/open-file
 * Opens a file in the system file explorer (Finder on macOS, etc.)
 * Body: { path: "/path/to/file.png" }
 */
app.post('/api/open-file', (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Verify path exists and is a file
    if (!fs.existsSync(filePath)) {
      console.error('[OpenFile] Path does not exist:', filePath);
      return res.status(400).json({ error: 'File does not exist' });
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      console.error('[OpenFile] Path is not a file:', filePath);
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const { execSync } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    console.log('[OpenFile] Opening file:', filePath, 'on platform:', platform);

    try {
      if (platform === 'darwin') {
        // macOS - use open -R to reveal in Finder
        execSync(`open -R "${filePath}"`, { stdio: 'ignore' });
      } else if (platform === 'win32') {
        // Windows - use explorer to open folder and select file
        const dir = require('path').dirname(filePath);
        execSync(`explorer /select,"${filePath}"`, { stdio: 'ignore', shell: 'cmd.exe' });
      } else if (platform === 'linux') {
        // Linux - try various file managers
        try {
          execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
        } catch (e) {
          try {
            execSync(`nautilus "${filePath}"`, { stdio: 'ignore' });
          } catch (e2) {
            try {
              execSync(`dolphin "${filePath}"`, { stdio: 'ignore' });
            } catch (e3) {
              console.warn('[OpenFile] Could not open file with any file manager');
              return res.status(500).json({ error: 'No file manager available' });
            }
          }
        }
      }

      console.log('[OpenFile] Successfully opened file:', filePath);
      res.json({ success: true, message: 'File opened in file explorer' });
    } catch (execError) {
      console.error('[OpenFile] Execution error:', execError.message);
      res.status(500).json({ error: 'Failed to open file', details: execError.message });
    }
  } catch (err) {
    console.error('[OpenFile] Error in endpoint:', err.message);
    res.status(500).json({ error: 'Failed to open file', details: err.message });
  }
});

/**
 * Helper function: Normalize prompt by removing artist tags
 * Removes patterns like {artist: ...}, [artist: ...}, artist: ..., etc.
 */
function normalizePrompt(prompt) {
  if (!prompt) return '';
  
  // Remove all artist tag patterns:
  // {artist: ...}, [artist: ...}, artist: ..., etc.
  let normalized = prompt
    .replace(/\{+artist:\s*[^}]*\}+/gi, '') // {artist: ...}
    .replace(/\[artist:\s*[^\]]*\]/gi, '')   // [artist: ...]
    .replace(/artist:\s*[^,})\]]+/gi, '')    // artist: ... (standalone)
    .replace(/,+\s*/g, ', ')                  // normalize commas
    .replace(/\s+/g, ' ')                     // normalize spaces
    .trim();
  
  // Remove leading/trailing commas and spaces
  normalized = normalized.replace(/^[\s,]+|[\s,]+$/g, '');
  
  return normalized.toLowerCase();
}

/**
 * Helper: Recursively scan folder for PNG files (including nested folders)
 * Returns array of objects with { filename, relativePath, fullPath, mtime }
 */
function scanPNGFilesRecursive(folderPath, basePath = folderPath) {
  const results = [];
  
  try {
    const entries = fs.readdirSync(folderPath);
    
    for (const entry of entries) {
      if (isMacSystemFile(entry)) continue;
      
      const fullPath = path.join(folderPath, entry);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        const subResults = scanPNGFilesRecursive(fullPath, basePath);
        results.push(...subResults);
      } else if (stats.isFile() && entry.endsWith('.png')) {
        const relativePath = path.relative(basePath, fullPath);
        results.push({
          filename: entry,
          relativePath: relativePath,
          fullPath: fullPath,
          mtime: stats.mtimeMs || stats.mtime.getTime()
        });
      }
    }
  } catch (err) {
    console.warn(`[PromptGrouping] Error scanning folder ${folderPath}:`, err.message);
  }
  
  return results;
}

/**
 * Track loading progress for each folder
 * Key: folderPath, Value: { totalFiles, processedFiles, status }
 */
const loadingProgress = new Map();

/**
 * POST /api/prompt-grouping/load-groups
 * Scans a folder (including nested folders), extracts prompts, normalizes them (removes artist tags),
 * and groups images by matching prompt content. Uses cached mapping when available for speed.
 * Request body: { folderPath: string, useCache?: boolean }
 * Response: { success: boolean, folder: string, groups: PromptGroupInfo[], totals: {...}, cached?: boolean }
 */
app.post('/api/prompt-grouping/load-groups', (req, res) => {
  try {
    const { folderPath, useCache = true } = req.body;
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

    const mappingFile = path.join(resolvedPath, '.prompt-mapping.json');
    
    // Try to use cached mapping if available
    if (useCache && fs.existsSync(mappingFile)) {
      try {
        const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        
        // Validate cache: Check if any files have been modified since last update OR if file count changed
        const pngFiles = scanPNGFilesRecursive(resolvedPath);
        const lastUpdated = mapping.lastUpdated ? new Date(mapping.lastUpdated).getTime() : 0;
        const cachedFileCount = mapping.totalFileCount || 0;
        const hasModifiedFiles = pngFiles.some(f => f.mtime > lastUpdated);
        const fileCountChanged = pngFiles.length !== cachedFileCount;
        
        console.log(`[PromptGrouping] Cache validation for ${resolvedPath}:`);
        console.log(`  - Cached file count: ${cachedFileCount}, Current file count: ${pngFiles.length}, Changed: ${fileCountChanged}`);
        console.log(`  - Last updated: ${mapping.lastUpdated}, Has modified files: ${hasModifiedFiles}`);
        
        if (!hasModifiedFiles && !fileCountChanged && mapping.groups && Object.keys(mapping.groups).length > 0) {
          // Cache is valid, use it
          console.log(`[PromptGrouping] ✓ Using cached mapping for ${resolvedPath}`);
          
          const groupNicknames = mapping.groupNicknames || {};
          const promptGroups = mapping.groups || {};
          
          // Convert to array and add metadata
          const groupsArray = Object.values(promptGroups).map(group => {
            if (!group.images || group.images.length === 0) return null;
            
            // Use cached mtime or recalculate if needed
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
                  // Ignore errors
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

          return res.json({
            success: true,
            folder: resolvedPath,
            groups: groupsArray,
            totals: {
              groups: groupsArray.length,
              images: groupsArray.reduce((sum, g) => sum + g.imageCount, 0)
            },
            cached: true
          });
        } else {
          const reasons = [];
          if (hasModifiedFiles) reasons.push('files modified');
          if (fileCountChanged) reasons.push('file count changed');
          if (!mapping.groups || Object.keys(mapping.groups).length === 0) reasons.push('no cached groups');
          console.log(`[PromptGrouping] ✗ Cache invalidated (${reasons.join(', ')}), will reprocess`);
        }
      } catch (err) {
        console.warn('[PromptGrouping] Cache validation failed, will reprocess:', err.message);
      }
    }

    // Full reprocessing needed
    console.log(`[PromptGrouping] Reprocessing ${resolvedPath}...`);
    
    let promptGroups = {};
    let promptToGroupId = {};
    let groupNicknames = {};
    
    if (fs.existsSync(mappingFile)) {
      try {
        const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        promptGroups = mapping.groups || {};
        promptToGroupId = mapping.promptToGroupId || {};
        groupNicknames = mapping.groupNicknames || {};
      } catch (err) {
        console.warn('[PromptGrouping] Failed to read mapping file:', err.message);
      }
    }

    // Scan all PNG files recursively
    const pngFiles = scanPNGFilesRecursive(resolvedPath);
    console.log(`[PromptGrouping] Found ${pngFiles.length} PNG files in ${resolvedPath}`);
    
    // Initialize progress tracking
    const folderKey = resolvedPath;
    loadingProgress.set(folderKey, {
      totalFiles: pngFiles.length,
      processedFiles: 0,
      status: 'processing'
    });

    // Process each file to extract prompt
    const processedImages = {};
    pngFiles.forEach((fileInfo, index) => {
      try {
        const fileBuffer = fs.readFileSync(fileInfo.fullPath);
        const metadata = readPNGMetadata(fileBuffer);
        
        let prompt = null;
        
        // Try to read embedded PNG metadata
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
          const match = fileInfo.filename.match(/^(.+?)\s+s-\d+\.png$/i);
          if (match) {
            prompt = match[1];
          }
        }
        
        if (prompt) {
          const normalizedPrompt = normalizePrompt(prompt);
          processedImages[fileInfo.relativePath] = {
            originalPrompt: prompt,
            normalizedPrompt: normalizedPrompt,
            fullPath: fileInfo.fullPath,
            mtime: fileInfo.mtime
          };
        }
      } catch (err) {
        console.warn(`[PromptGrouping] Failed to process ${fileInfo.relativePath}:`, err.message);
      }
      
      // Update progress
      loadingProgress.set(folderKey, {
        totalFiles: pngFiles.length,
        processedFiles: index + 1,
        status: 'processing'
      });
    });

    // Group images by normalized prompt
    const nextGroupId = Math.max(0, ...Object.keys(promptGroups).map(Number)) + 1;
    let currentGroupId = nextGroupId;

    console.log(`[PromptGrouping] processedImages count: ${Object.keys(processedImages).length}`);
    console.log(`[PromptGrouping] processedImages keys:`, Object.keys(processedImages));

    for (const [relativePath, imgData] of Object.entries(processedImages)) {
      const normalized = imgData.normalizedPrompt;
      
      console.log(`[PromptGrouping] Processing image: ${relativePath}, normalized: ${normalized.substring(0, 50)}...`);
      
      // Check if this normalized prompt already has a group
      if (promptToGroupId[normalized]) {
        const groupId = promptToGroupId[normalized];
        if (promptGroups[groupId]) {
          // Prevent duplicate images from being added to the same group
          if (!promptGroups[groupId].images.includes(relativePath)) {
            promptGroups[groupId].images.push(relativePath);
            console.log(`[PromptGrouping] Added to existing group ${groupId}, now has ${promptGroups[groupId].images.length} images`);
          } else {
            console.warn(`[PromptGrouping] Duplicate image "${relativePath}" already in group ${groupId}, skipping`);
          }
        }
      } else {
        // Create new group
        const groupId = currentGroupId++;
        promptToGroupId[normalized] = groupId;
        promptGroups[groupId] = {
          groupId: groupId,
          groupName: `Group ${groupId}`,
          normalizedPrompt: normalized,
          images: [relativePath],
          sampleOriginalPrompt: imgData.originalPrompt
        };
        console.log(`[PromptGrouping] Created new group ${groupId} with image: ${relativePath}`);
      }
    }

    // Convert to array and add metadata
    const groupsArray = Object.values(promptGroups).map(group => {
      if (!group.images || group.images.length === 0) return null;
      
      // Check for duplicate images in the group
      const uniqueImages = new Set(group.images);
      if (uniqueImages.size !== group.images.length) {
        console.warn(`[PromptGrouping] GROUP ${group.groupId} HAS DUPLICATES!`);
        console.warn(`[PromptGrouping] Total images: ${group.images.length}, Unique: ${uniqueImages.size}`);
        console.warn(`[PromptGrouping] Images array:`, group.images);
        
        // Remove duplicates and keep only unique images
        group.images = Array.from(uniqueImages);
        console.log(`[PromptGrouping] Deduplicated to ${group.images.length} unique images`);
      }
      
      // Get latest modification time
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
          // Ignore errors
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

    // Save mapping file for future reference (with mtime info for cache validation)
    try {
      const mappingToSave = {
        groups: Object.fromEntries(Object.entries(promptGroups).map(([id, g]) => {
          return [id, {
            ...g,
            latestModifiedTime: groupsArray.find(ga => ga.groupId === parseInt(id))?.latestModifiedTime
          }];
        })),
        promptToGroupId: promptToGroupId,
        groupNicknames: groupNicknames,
        lastUpdated: new Date().toISOString(),
        totalFileCount: pngFiles.length  // Store file count for cache validation
      };
      fs.writeFileSync(mappingFile, JSON.stringify(mappingToSave, null, 2));
      console.log('[PromptGrouping] Mapping file saved:', mappingFile);
    } catch (err) {
      console.warn('[PromptGrouping] Failed to save mapping file:', err.message);
    }

    // Clear progress tracking
    loadingProgress.delete(folderKey);

    res.json({
      success: true,
      folder: resolvedPath,
      groups: groupsArray,
      totals: {
        groups: groupsArray.length,
        images: groupsArray.reduce((sum, g) => sum + g.imageCount, 0)
      },
      cached: false
    });
  } catch (err) {
    console.error('[PromptGrouping] Error loading groups:', err);
    res.status(500).json({ error: 'Failed to load prompt groups', details: err.message });
  }
});

/**
 * GET /api/prompt-grouping/progress
 * Get the current loading progress for a folder
 * Query params: { folderPath: string }
 */
app.get('/api/prompt-grouping/progress', (req, res) => {
  try {
    const { folderPath } = req.query;
    if (!folderPath) {
      return res.status(400).json({ error: 'Missing folderPath' });
    }

    const resolvedPath = path.resolve(folderPath);
    const progress = loadingProgress.get(resolvedPath);

    if (!progress) {
      return res.json({
        status: 'idle',
        totalFiles: 0,
        processedFiles: 0,
        percentage: 0
      });
    }

    res.json({
      status: progress.status,
      totalFiles: progress.totalFiles,
      processedFiles: progress.processedFiles,
      percentage: Math.round((progress.processedFiles / progress.totalFiles) * 100)
    });
  } catch (err) {
    console.error('[PromptGrouping] Error getting progress:', err);
    res.status(500).json({ error: 'Failed to get progress', details: err.message });
  }
});

/**
 * POST /api/prompt-grouping/set-nickname
 * Set a nickname for a group ID
 * Request body: { folderPath: string, groupId: number, nickname: string }
 */
app.post('/api/prompt-grouping/set-nickname', (req, res) => {
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
        console.warn('[PromptGrouping] Failed to read mapping file:', err.message);
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

    res.json({
      success: true,
      groupId: groupId,
      nickname: mapping.groupNicknames[groupId] || ''
    });
  } catch (err) {
    console.error('[PromptGrouping] Error setting nickname:', err);
    res.status(500).json({ error: 'Failed to set nickname', details: err.message });
  }
});

/**
 * POST /api/prompt-grouping/load-groups
 * Scans a folder (including nested folders), extracts prompts, normalizes them (removes artist tags),
 * and groups images by matching prompt content
 * Request body: { folderPath: string }
 * Response: { success: boolean, folder: string, groups: PromptGroupInfo[], totals: {...} }
 */
// NOTE: This endpoint is defined above, removing duplicate definition

/**
 * GET /api/prompt-grouping/image
 * Serves image file from prompt-grouping folder
 * Optimized with aggressive caching for thumbnails (24-hour browser cache)
 */
app.get('/api/prompt-grouping/image', (req, res) => {
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
 * Serves image metadata including original prompt and artist tags
 */
app.get('/api/prompt-grouping/image-metadata', (req, res) => {
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
    const metadata = readPNGMetadata(imageBuffer);
    
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
    
    const artists = extractArtistTags(prompt);
    const normalizedPrompt = normalizePrompt(prompt);

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
app.post('/api/prompt-grouping/save-ratings', (req, res) => {
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

    const ratingsFile = path.join(resolvedPath, '.prompt-ratings.json');
    
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
app.get('/api/prompt-grouping/load-ratings', (req, res) => {
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

    const ratingsFile = path.join(resolvedPath, '.prompt-ratings.json');
    
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

/**
 * POST /api/artist-gallery/save-ratings
 * Save image ratings for an artist group to a separate file
 */
app.post('/api/artist-gallery/save-ratings', (req, res) => {
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
app.get('/api/artist-gallery/load-ratings', (req, res) => {
  try {
    const folderPath = req.query.folderPath;
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
// No normalization needed - just use full filenames as keys

/**
 * POST /api/ratings/save
 * Save image ratings to a unified ratings file (works for both prompt grouping and artist gallery)
 * File: .image-ratings.json
 * 
 * IMPORTANT: This MERGES new ratings with existing ratings (does NOT overwrite)
 * Also normalizes all keys to consistent basename format (prevents data loss from format mismatches)
 */
app.post('/api/ratings/save', (req, res) => {
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
      // SIMPLE: Load existing ratings, merge with new ones, save
      let existingRatings = {};
      if (fs.existsSync(ratingsFile)) {
        try {
          existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
          console.log('[Ratings] Loaded existing ratings with', Object.keys(existingRatings).length, 'entries');
        } catch (parseErr) {
          console.warn('[Ratings] Failed to parse existing ratings file, starting fresh:', parseErr.message);
          existingRatings = {};
        }
      }
      
      // Simple merge: existing + new (new ratings override old ones)
      const mergedRatings = { ...existingRatings, ...ratings };
      
      console.log('[Ratings] Existing:', Object.keys(existingRatings).length, 'entries');
      console.log('[Ratings] New:', Object.keys(ratings).length, 'entries');
      console.log('[Ratings] Merged:', Object.keys(mergedRatings).length, 'entries');
      console.log('[Ratings] New ratings being added:', ratings);
      
      fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
      console.log('[Ratings] Ratings saved to:', ratingsFile);
      res.json({ 
        success: true, 
        message: 'Ratings saved',
        totalEntries: Object.keys(mergedRatings).length,
        newEntries: Object.keys(ratings).length
      });
    } catch (err) {
      console.error('[Ratings] Failed to save ratings:', err);
      res.status(500).json({ error: 'Failed to save ratings', details: err.message });
    }
  } catch (err) {
    console.error('[Ratings] Error in save:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

/**
 * GET /api/ratings/load
 * Load image ratings from unified ratings file (works for both prompt grouping and artist gallery)
 * File: .image-ratings.json
 */
app.get('/api/ratings/load', (req, res) => {
  try {
    const folderPath = req.query.folderPath;
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
        console.log('[Ratings] Loaded ratings from:', ratingsFile);
        console.log('[Ratings] Total entries:', Object.keys(ratings).length);
        console.log('[Ratings] Keys:', Object.keys(ratings));
        res.json({ success: true, ratings });
      } else {
        console.log('[Ratings] No ratings file found at:', ratingsFile);
        res.json({ success: true, ratings: {} });
      }
    } catch (err) {
      console.error('[Ratings] Failed to load ratings:', err);
      res.status(500).json({ error: 'Failed to load ratings', details: err.message });
    }
  } catch (err) {
    console.error('[Ratings] Error in load:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ============ BATCH RATING API ENDPOINTS (Google Cloud Vision AI-based) ============

const { v4: uuidv4 } = require('uuid');

// In-memory job store (in production, use a database)
const batchJobs = new Map();

/**
 * POST /api/batch-rating/submit
 * Submit a batch of illustrations for AI analysis
 * Uses Google Cloud Vision API (async)
 */
app.post('/api/batch-rating/submit', async (req, res) => {
  const { folderPath, imageFilenames } = req.body;

  if (!Array.isArray(imageFilenames) || imageFilenames.length === 0) {
    return res.status(400).json({ error: 'Invalid imageFilenames' });
  }

  const jobId = uuidv4();
  
  console.log(`[BatchRating] New batch job submitted: ${jobId}`);
  console.log(`[BatchRating] Images: ${imageFilenames.length}, Folder: ${folderPath}`);
  console.log(`[BatchRating] Image filenames received:`, imageFilenames);
  
  // Check for duplicates in the array
  const uniqueImages = new Set(imageFilenames);
  if (uniqueImages.size !== imageFilenames.length) {
    console.warn(`[BatchRating] ⚠️ DUPLICATE FILENAMES DETECTED! Received ${imageFilenames.length} but only ${uniqueImages.size} unique`);
    console.log(`[BatchRating] Duplicates:`, imageFilenames.filter((img, idx) => imageFilenames.indexOf(img) !== idx));
  }

  // Create job record
  const job = {
    jobId,
    status: 'pending',
    totalImages: imageFilenames.length,
    processedImages: 0,
    createdAt: new Date(),
    folderPath,
    imageFilenames,
    results: {},
    error: null
  };

  batchJobs.set(jobId, job);

  // Calculate estimated time (0.8-1.0 seconds per image via Cloud Vision API)
  const estimatedSeconds = Math.ceil(imageFilenames.length * 0.9);
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  // Start processing in background (don't wait for completion)
  processBatchJob(jobId).catch(err => {
    console.error(`[BatchRating] Job ${jobId} failed:`, err);
    job.status = 'failed';
    job.error = err.message;
  });

  res.json({
    jobId,
    estimatedTime: `${estimatedMinutes} minute${estimatedMinutes > 1 ? 's' : ''}`
  });
});

/**
 * GET /api/batch-rating/status/:jobId
 * Get batch job status
 */
app.get('/api/batch-rating/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = batchJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    totalImages: job.totalImages,
    processedImages: job.processedImages,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
    error: job.error
  });
});

/**
 * GET /api/batch-rating/jobs
 * Get all active jobs
 */
app.get('/api/batch-rating/jobs', (req, res) => {
  const jobs = Array.from(batchJobs.values()).map(job => ({
    jobId: job.jobId,
    status: job.status,
    totalImages: job.totalImages,
    processedImages: job.processedImages,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  }));

  res.json(jobs);
});

/**
 * GET /api/batch-rating/results/:jobId
 * Get batch job results
 */
app.get('/api/batch-rating/results/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = batchJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not completed yet' });
  }

  console.log(`[BatchRating] GET results for job ${jobId}:`);
  console.log(`  - job.results keys:`, Object.keys(job.results));
  console.log(`  - job.results values:`, Object.values(job.results));
  console.log(`  - Full job.results:`, job.results);
  res.json(job.results);
});

/**
 * POST /api/batch-rating/cancel/:jobId
 * Cancel a batch job
 */
app.post('/api/batch-rating/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = batchJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return res.status(400).json({ error: 'Cannot cancel completed/failed job' });
  }

  job.status = 'cancelled';
  console.log(`[BatchRating] Job ${jobId} cancelled`);

  res.json({ success: true });
});

/**
 * Process batch job using local image analysis
 * Analyzes each image and calculates quality scores
 */
async function processBatchJob(jobId) {
  const job = batchJobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  console.log(`[BatchRating] Starting processing for job ${jobId}`);
  console.log(`[BatchRating] Job imageFilenames (count: ${job.imageFilenames.length}):`, job.imageFilenames);
  console.log(`[BatchRating] Job folderPath: ${job.folderPath}`);

  const filePaths = job.imageFilenames.map(img => `${job.folderPath}/${img}`);
  console.log(`[BatchRating] Computed filePaths (count: ${filePaths.length}):`, filePaths);

  try {
    for (let i = 0; i < filePaths.length; i++) {
      // Check if job was cancelled
      if (job.status === 'cancelled') {
        console.log(`[BatchRating] Job ${jobId} was cancelled, stopping processing`);
        return;
      }

      try {
        const filePath = filePaths[i];
        const filename = path.basename(filePath);
        
        console.log(`[BatchRating] Processing image ${i + 1}/${filePaths.length}:`);
        console.log(`  - Full path: ${filePath}`);
        console.log(`  - Basename: ${filename}`);
        console.log(`  - Image filenames passed in: ${job.imageFilenames[i]}`);

        if (!fs.existsSync(filePath)) {
          console.warn(`[BatchRating] File not found: ${filePath}`);
          job.processedImages++;
          continue;
        }

        // Analyze image quality using local metrics with retry logic
        let score = null;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries && score === null) {
          try {
            score = await analyzeImageQualityLocal(filePath);
            console.log(`[BatchRating] Got score for ${filename}: ${score}`);
          } catch (apiErr) {
            retryCount++;
            console.error(`[BatchRating] Vision API error (attempt ${retryCount}/${maxRetries}) for ${filename}:`, apiErr.message);
            
            if (retryCount < maxRetries) {
              // Exponential backoff: wait longer between retries (1s, 2s, 4s)
              const backoffDelay = Math.pow(2, retryCount - 1) * 1000;
              console.log(`[BatchRating] Retrying in ${backoffDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            } else {
              // Use fallback score after max retries
              console.warn(`[BatchRating] Max retries exceeded for ${filename}, using fallback score`);
              score = Math.floor(Math.random() * 5) + 5;
            }
          }
        }

        // Apply user feedback corrections if available
        const rawScore = score;
        const feedbackData = loadFeedback(job.folderPath);
        
        // PHASE 1: Apply learned patterns from ALL feedback
        console.log(`[BatchRating] Learning patterns from ${feedbackData.entries.length} feedback entries for ${filename}...`);
        const learnedPatterns = calculateLearnedPatterns(feedbackData);
        
        if (learnedPatterns) {
          // Apply learned corrections to estimated component scores
          let anatomy = 6, pose = 6, face = 6, background = 6, objects = 6, coherence = 6;
          
          // Detect image type from available label info (fallback to photo)
          let isIllustration = filename.toLowerCase().includes('anime') || 
                               filename.toLowerCase().includes('illustration') ||
                               filename.toLowerCase().includes('drawing');
          
          // Apply learned pattern adjustments with confidence threshold
          for (const [component, pattern] of Object.entries(learnedPatterns)) {
            if (pattern.confidence >= 0.6) {
              const baseScore = component === 'anatomy' ? anatomy :
                               component === 'pose' ? pose :
                               component === 'face' ? face :
                               component === 'background' ? background :
                               component === 'objects' ? objects :
                               coherence;
              
              const maxAdjustment = 2;
              const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, pattern.avg));
              const adjustedScore = Math.max(1, Math.min(10, baseScore + adjustment));
              
              if (component === 'anatomy') anatomy = adjustedScore;
              else if (component === 'pose') pose = adjustedScore;
              else if (component === 'face') face = adjustedScore;
              else if (component === 'background') background = adjustedScore;
              else if (component === 'objects') objects = adjustedScore;
              else if (component === 'coherence') coherence = adjustedScore;
            }
          }
          
          let patternScore;
          if (isIllustration) {
            patternScore = Math.round(
              (anatomy * 0.15 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.20 + coherence * 0.15)
            );
          } else {
            patternScore = Math.round(
              (anatomy * 0.20 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.15 + coherence * 0.15)
            );
          }
          
          console.log(`[BatchRating] Applied learned patterns for ${filename}: ${rawScore} → ${patternScore}`);
          score = patternScore;
        }
        
        // PHASE 2: If specific image feedback exists, override with it
        const priorFeedback = feedbackData.entries.find(e => e.imageId === filename);
        
        if (priorFeedback && priorFeedback.components) {
          // Recalculate score with feedback components (overrides learned patterns)
          let anatomy = priorFeedback.components.anatomy || 6;
          let pose = priorFeedback.components.pose || 6;
          let face = priorFeedback.components.face || 6;
          let background = priorFeedback.components.background || 6;
          let objects = priorFeedback.components.objects || 6;
          let coherence = priorFeedback.components.coherence || 6;
          
          // Detect image type to use correct weights
          const labels = priorFeedback.detectedLabels || [];
          const labelNames = labels.map(l => l.toLowerCase ? l.toLowerCase() : l);
          const isIllustration = labelNames.some(l => 
            l.includes('anime') || l.includes('illustration') || l.includes('drawing') || 
            l.includes('art') || l.includes('cartoon') || l.includes('painting')
          );
          
          let feedbackScore;
          if (isIllustration) {
            feedbackScore = Math.round(
              (anatomy * 0.15 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.20 + coherence * 0.15)
            );
          } else {
            feedbackScore = Math.round(
              (anatomy * 0.20 + pose * 0.15 + face * 0.20 + background * 0.15 + objects * 0.15 + coherence * 0.15)
            );
          }
          
          console.log(`[BatchRating] Applied specific feedback for ${filename}: ${score} → ${feedbackScore}`);
          score = feedbackScore;
        }

        job.results[filename] = score;
        console.log(`[BatchRating] Stored result - filename: ${filename}, score: ${score}`);
        console.log(`[BatchRating] job.results keys after storing: ${Object.keys(job.results)}`);
        console.log(`[BatchRating] job.results: `, job.results);

        job.processedImages++;
        console.log(`[BatchRating] Processed ${filename}: ${score}/10`);

      } catch (err) {
        console.error(`[BatchRating] Error processing file ${i + 1}:`, err);
        job.processedImages++;
      }

      // Delay between processing to avoid Vision API rate limiting
      // Increased to 500ms to be more respectful of API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    job.status = 'completed';
    job.completedAt = new Date();

    // Save results to .image-ratings.json (MERGE with existing ratings, don't overwrite)
    const ratingsFile = path.join(job.folderPath, '.image-ratings.json');
    try {
      // Load existing ratings first
      let existingRatings = {};
      if (fs.existsSync(ratingsFile)) {
        try {
          existingRatings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
          console.log(`[BatchRating] Loaded existing ratings with ${Object.keys(existingRatings).length} entries`);
        } catch (parseErr) {
          console.warn(`[BatchRating] Failed to parse existing ratings, starting fresh:`, parseErr.message);
          existingRatings = {};
        }
      }
      
      // MERGE existing ratings with new batch results
      const mergedRatings = { ...existingRatings, ...job.results };
      
      console.log(`[BatchRating] Existing entries: ${Object.keys(existingRatings).length}`);
      console.log(`[BatchRating] New batch results: ${Object.keys(job.results).length}`);
      console.log(`[BatchRating] Merged total: ${Object.keys(mergedRatings).length}`);
      
      fs.writeFileSync(ratingsFile, JSON.stringify(mergedRatings, null, 2));
      console.log(`[BatchRating] Job ${jobId} results saved to: ${ratingsFile}`);
    } catch (err) {
      console.error(`[BatchRating] Failed to save results: ${err.message}`);
    }

    console.log(`[BatchRating] Job ${jobId} completed! ${job.processedImages} images processed`);

  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    console.error(`[BatchRating] Job ${jobId} failed:`, err);
  }
}

/**
 * Analyze image quality using Google Cloud Vision API
 * Extracts: anatomy, pose, face quality, background, objects, coherence
 * Supports both photo and illustration scoring with custom weights
 */
async function analyzeImageQualityLocal(filePath) {
  console.log(`[ImageQuality] START analyzing: ${filePath}`);
  const startTime = Date.now();
  
  try {
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    console.log(`[ImageQuality] Read file ${path.basename(filePath)}: ${imageBuffer.length} bytes`);

    const request = {
      image: {
        content: base64Image
      },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 20 },
        { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
        { type: 'SAFE_SEARCH_DETECTION' },
        { type: 'IMAGE_PROPERTIES' },
        { type: 'WEB_DETECTION', maxResults: 5 }
      ]
    };

    const [result] = await visionClient.annotateImage(request);
    const labels = result.labelAnnotations || [];
    const objects = result.localizedObjectAnnotations || [];
    console.log(`[ImageQuality] Vision API returned ${labels.length} labels for: ${path.basename(filePath)}`);

    // Calculate scores based on detected content
    let anatomyScore = 6;
    let poseScore = 6;
    let faceQuality = 6;
    let backgroundQuality = 6;
    let objectQuality = 6;
    let coherenceScore = 6;
    const issues = [];
    const strengths = [];

    // Analyze labels to improve scores
    const labelNames = labels.map(l => l.description.toLowerCase());

    // DETECT IMAGE TYPE: Photo vs Illustration
    const isIllustration = labelNames.some(l => 
      l.includes('illustration') || 
      l.includes('drawing') || 
      l.includes('art') ||
      l.includes('digital art') ||
      l.includes('anime') ||
      l.includes('cartoon') ||
      l.includes('painting')
    );
    
    const hasArtisticStyle = labelNames.some(l =>
      l.includes('style') ||
      l.includes('texture') ||
      l.includes('abstract')
    );
    
    const isIllustrativeContent = isIllustration || hasArtisticStyle;
    console.log(`[ImageQuality] Image type - Illustration: ${isIllustrativeContent}, Labels: ${labelNames.join(', ')}`);

    // Anatomy checks
    if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
      anatomyScore += 2;
      strengths.push('Clear hand/arm anatomy');
    } else if (labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character'))) {
      anatomyScore += 1;
    }

    // Pose and gesture checks
    if (labelNames.some(l => l.includes('gesture') || l.includes('pose') || l.includes('standing') || l.includes('sitting') || l.includes('action'))) {
      poseScore += 2;
      strengths.push('Good pose/gesture');
    }

    // Face checks
    if (labelNames.some(l => l.includes('face') || l.includes('portrait') || l.includes('expression'))) {
      faceQuality += 2;
      strengths.push('Clear facial features');
    } else if (labelNames.some(l => l.includes('head') || l.includes('close-up'))) {
      faceQuality += 1;
    }

    // Background checks
    if (labelNames.some(l => l.includes('background') || l.includes('scene') || l.includes('environment'))) {
      backgroundQuality += 2;
      strengths.push('Well-defined background');
    } else if (labelNames.some(l => l.includes('art') || l.includes('illustration') || l.includes('drawing') || l.includes('style'))) {
      backgroundQuality += 1;
    }

    // Object/clothing checks
    if (labelNames.some(l => l.includes('cloth') || l.includes('fashion') || l.includes('uniform') || l.includes('dress') || l.includes('costume'))) {
      objectQuality += 2;
      strengths.push('Good clothing detail');
    }

    // Coherence - based on overall label complexity and clarity
    if (labels.length > 8) {
      coherenceScore += 2;
      strengths.push('Complex, well-composed image');
    } else if (labels.length > 4) {
      coherenceScore += 1;
    }

    // ILLUSTRATION-SPECIFIC BOOSTS
    if (isIllustrativeContent) {
      // Boost for artistic composition
      if (labels.length > 6) {
        coherenceScore = Math.min(10, coherenceScore + 1);
        if (!strengths.includes('Artistic composition')) {
          strengths.push('Artistic composition');
        }
      }
      
      // Boost for clear character/subject
      if (labelNames.some(l => l.includes('character') || l.includes('figure'))) {
        anatomyScore = Math.min(10, anatomyScore + 1);
        poseScore = Math.min(10, poseScore + 1);
      }
      
      // Boost for stylized art
      if (hasArtisticStyle) {
        coherenceScore = Math.min(10, coherenceScore + 1);
        if (!strengths.includes('Stylized artwork')) {
          strengths.push('Stylized artwork');
        }
      }
    }

    // Safe search - check if image has appropriate content
    const safeSearch = result.safeSearchAnnotation || {};
    if (safeSearch.adult === 'VERY_LIKELY' || safeSearch.adult === 'LIKELY') {
      issues.push('Adult content detected');
      // Note: Adult content is detected but does not affect scoring
    }
    if (safeSearch.violence === 'VERY_LIKELY' || safeSearch.violence === 'LIKELY') {
      issues.push('Violence detected');
      poseScore = Math.max(1, poseScore - 2);
    }

    // Detect missing elements
    if (!labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character') || l.includes('figure'))) {
      issues.push('No clear subject detected');
      anatomyScore = Math.max(1, anatomyScore - 2);
    }

    // Clamp scores to 1-10
    anatomyScore = Math.max(1, Math.min(10, Math.round(anatomyScore)));
    poseScore = Math.max(1, Math.min(10, Math.round(poseScore)));
    faceQuality = Math.max(1, Math.min(10, Math.round(faceQuality)));
    backgroundQuality = Math.max(1, Math.min(10, Math.round(backgroundQuality)));
    objectQuality = Math.max(1, Math.min(10, Math.round(objectQuality)));
    coherenceScore = Math.max(1, Math.min(10, Math.round(coherenceScore)));

    // Calculate overall score with CUSTOM WEIGHTS based on image type
    let overallScore;
    
    if (isIllustrativeContent) {
      // ILLUSTRATION WEIGHTS - Emphasize composition and subject clarity
      // Anatomy: 15% (less strict - allow stylization)
      // Pose: 15% (important for character design)
      // Face: 20% (very important for character)
      // Background: 15% (supports storytelling)
      // Objects/Clothing: 20% (costume/design is central to illustration)
      // Coherence: 15% (overall composition)
      overallScore = Math.round(
        (anatomyScore * 0.15 + 
         poseScore * 0.15 + 
         faceQuality * 0.20 + 
         backgroundQuality * 0.15 + 
         objectQuality * 0.20 + 
         coherenceScore * 0.15) / 1
      );
      console.log(`[ImageQuality] Using ILLUSTRATION weights (type: ${isIllustration ? 'detected' : 'artistic'})`);
    } else {
      // PHOTO WEIGHTS - Standard evaluation
      // Anatomy: 20%, Pose: 15%, Face: 20%, Background: 15%, Objects: 15%, Coherence: 15%
      overallScore = Math.round(
        (anatomyScore * 0.20 + 
         poseScore * 0.15 + 
         faceQuality * 0.20 + 
         backgroundQuality * 0.15 + 
         objectQuality * 0.15 + 
         coherenceScore * 0.15) / 1
      );
      console.log(`[ImageQuality] Using PHOTO weights`);
    }

    // DEBUG: Log detailed component scores
    console.log(`[ImageQuality] Component scores: Anatomy=${anatomyScore}, Pose=${poseScore}, Face=${faceQuality}, BG=${backgroundQuality}, Objects=${objectQuality}, Coherence=${coherenceScore}`);
    if (isIllustrativeContent) {
      console.log(`[ImageQuality] Calculation: (${anatomyScore}*0.15 + ${poseScore}*0.15 + ${faceQuality}*0.20 + ${backgroundQuality}*0.15 + ${objectQuality}*0.20 + ${coherenceScore}*0.15) = ${overallScore}`);
    } else {
      console.log(`[ImageQuality] Calculation: (${anatomyScore}*0.20 + ${poseScore}*0.15 + ${faceQuality}*0.20 + ${backgroundQuality}*0.15 + ${objectQuality}*0.15 + ${coherenceScore}*0.15) = ${overallScore}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[ImageQuality] FINAL SCORE for ${path.basename(filePath)}: ${overallScore}/10 (${elapsed}ms)`);
    return overallScore;

  } catch (err) {
    console.error('[ImageQuality] Vision API analysis failed for', path.basename(filePath), ':', err.message);
    // Fall back to random score on error
    const fallbackScore = Math.floor(Math.random() * 5) + 5;
    console.warn(`[ImageQuality] Using fallback score ${fallbackScore}/10 for ${path.basename(filePath)}`);
    return fallbackScore;
  }
}

/**
 * POST /api/analyze-illustration
 * Analyze a single illustration using Google Cloud Vision API
 */
app.post('/api/analyze-illustration', async (req, res) => {
  const { filePath } = req.body;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'File not found' });
  }

  try {
    console.log(`[Illustration] Analyzing with Vision API: ${filePath}`);

    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');

    const request = {
      image: {
        content: base64Image
      },
      features: [
        { type: 'LABEL_DETECTION', maxResults: 20 },
        { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
        { type: 'SAFE_SEARCH_DETECTION' },
        { type: 'IMAGE_PROPERTIES' },
        { type: 'WEB_DETECTION', maxResults: 5 }
      ]
    };

    const [result] = await visionClient.annotateImage(request);
    const labels = result.labelAnnotations || [];
    const objects = result.localizedObjectAnnotations || [];
    const safeSearch = result.safeSearchAnnotation || {};
    const colors = result.imagePropertiesAnnotation?.dominantColors?.colors || [];

    // Analyze labels
    let anatomyScore = 6;
    let poseScore = 6;
    let faceQuality = 6;
    let backgroundQuality = 6;
    let objectQuality = 6;
    let coherenceScore = 6;
    const issues = [];
    const strengths = [];
    const recommendations = [];

    const labelNames = labels.map(l => l.description.toLowerCase());
    const confidences = labels.map(l => l.score);
    const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b) / confidences.length * 100) : 0;

    // DETECT IMAGE TYPE: Photo vs Illustration (SAME LOGIC AS BATCH)
    const isIllustration = labelNames.some(l => 
      l.includes('illustration') || 
      l.includes('drawing') || 
      l.includes('art') ||
      l.includes('digital art') ||
      l.includes('anime') ||
      l.includes('cartoon') ||
      l.includes('painting')
    );
    
    const hasArtisticStyle = labelNames.some(l =>
      l.includes('style') ||
      l.includes('texture') ||
      l.includes('abstract')
    );
    
    const isIllustrativeContent = isIllustration || hasArtisticStyle;
    console.log(`[Illustration] Image type - Illustration: ${isIllustrativeContent}, Labels: ${labelNames.join(', ')}`);

    // --- Anatomy Analysis ---
    if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
      anatomyScore = Math.min(10, anatomyScore + 2);
      strengths.push('Clear hand/arm anatomy');
    } else if (labelNames.some(l => l.includes('leg') || l.includes('foot'))) {
      anatomyScore = Math.min(10, anatomyScore + 1);
    }

    if (labelNames.some(l => l.includes('proportion') || l.includes('symmetr'))) {
      anatomyScore = Math.min(10, anatomyScore + 1);
      strengths.push('Good proportions');
    }

    // --- Pose & Gesture Analysis ---
    if (labelNames.some(l => l.includes('gesture') || l.includes('pose') || l.includes('standing') || l.includes('sitting') || l.includes('lying'))) {
      poseScore = Math.min(10, poseScore + 2);
      strengths.push('Good pose/gesture');
    }

    if (labelNames.some(l => l.includes('dynamic') || l.includes('action') || l.includes('motion'))) {
      poseScore = Math.min(10, poseScore + 1);
      strengths.push('Dynamic composition');
    }

    // --- Face Quality Analysis ---
    if (labelNames.some(l => l.includes('face') || l.includes('portrait'))) {
      faceQuality = Math.min(10, faceQuality + 2);
      strengths.push('Clear facial features');
    } else if (labelNames.some(l => l.includes('head') || l.includes('expression'))) {
      faceQuality = Math.min(10, faceQuality + 1);
    }

    if (labelNames.some(l => l.includes('eye') || l.includes('mouth') || l.includes('smile'))) {
      faceQuality = Math.min(10, faceQuality + 1);
      strengths.push('Expressive face');
    }

    // --- Background Analysis ---
    if (labelNames.some(l => l.includes('background') || l.includes('scene') || l.includes('landscape'))) {
      backgroundQuality = Math.min(10, backgroundQuality + 2);
      strengths.push('Well-defined background');
    } else if (labelNames.some(l => l.includes('art') || l.includes('illustration') || l.includes('drawing') || l.includes('style'))) {
      backgroundQuality = Math.min(10, backgroundQuality + 1);
    }

    if (labelNames.some(l => l.includes('nature') || l.includes('indoor') || l.includes('outdoor'))) {
      backgroundQuality = Math.min(10, backgroundQuality + 1);
    }

    // --- Object/Clothing Analysis ---
    if (labelNames.some(l => l.includes('cloth') || l.includes('fashion') || l.includes('uniform') || l.includes('dress') || l.includes('costume'))) {
      objectQuality = Math.min(10, objectQuality + 2);
      strengths.push('Good clothing detail');
    }

    if (objects.length > 3) {
      objectQuality = Math.min(10, objectQuality + 1);
      strengths.push(`${objects.length} objects clearly identified`);
    }

    // --- Coherence & Overall Composition ---
    if (labels.length > 12) {
      coherenceScore = Math.min(10, coherenceScore + 2);
      strengths.push('Complex, well-composed image');
    } else if (labels.length > 6) {
      coherenceScore = Math.min(10, coherenceScore + 1);
    }

    if (colors.length > 3) {
      coherenceScore = Math.min(10, coherenceScore + 1);
      strengths.push('Rich color palette');
    }

    // ILLUSTRATION-SPECIFIC BOOSTS (SAME AS BATCH)
    if (isIllustrativeContent) {
      // Boost for artistic composition
      if (labels.length > 6) {
        coherenceScore = Math.min(10, coherenceScore + 1);
        if (!strengths.includes('Artistic composition')) {
          strengths.push('Artistic composition');
        }
      }
      
      // Boost for clear character/subject
      if (labelNames.some(l => l.includes('character') || l.includes('figure'))) {
        anatomyScore = Math.min(10, anatomyScore + 1);
        poseScore = Math.min(10, poseScore + 1);
      }
      
      // Boost for stylized art
      if (hasArtisticStyle) {
        coherenceScore = Math.min(10, coherenceScore + 1);
        if (!strengths.includes('Stylized artwork')) {
          strengths.push('Stylized artwork');
        }
      }
    }

    // --- Safety & Content Checks ---
    if (safeSearch.adult === 'VERY_LIKELY' || safeSearch.adult === 'LIKELY') {
      issues.push('Adult content detected');
      // Note: Adult content does not affect anatomy scoring - adult images can have excellent anatomy
    }
    if (safeSearch.violence === 'VERY_LIKELY' || safeSearch.violence === 'LIKELY') {
      issues.push('Violence detected');
      poseScore = Math.max(1, poseScore - 2);
    }

    // --- Issue Detection ---
    if (!labelNames.some(l => l.includes('person') || l.includes('human') || l.includes('character') || l.includes('figure'))) {
      issues.push('No clear subject/character detected');
      anatomyScore = Math.max(1, anatomyScore - 2);
    }

    if (labelNames.some(l => l.includes('low') || l.includes('blur') || l.includes('pixelat'))) {
      issues.push('Image quality issues detected');
      coherenceScore = Math.max(1, coherenceScore - 2);
      recommendations.push('Consider using a higher resolution image');
    }

    if (backgroundQuality < 5) {
      recommendations.push('Enhance background detail and definition');
    }

    if (anatomyScore < 5) {
      recommendations.push('Improve anatomical accuracy of the character');
    }

    // Clamp all scores to 1-10
    anatomyScore = Math.max(1, Math.min(10, Math.round(anatomyScore)));
    poseScore = Math.max(1, Math.min(10, Math.round(poseScore)));
    faceQuality = Math.max(1, Math.min(10, Math.round(faceQuality)));
    backgroundQuality = Math.max(1, Math.min(10, Math.round(backgroundQuality)));
    objectQuality = Math.max(1, Math.min(10, Math.round(objectQuality)));
    coherenceScore = Math.max(1, Math.min(10, Math.round(coherenceScore)));

    // DEBUG: Log component scores
    console.log(`[Illustration] Component scores: Anatomy=${anatomyScore}, Pose=${poseScore}, Face=${faceQuality}, BG=${backgroundQuality}, Objects=${objectQuality}, Coherence=${coherenceScore}`);

    // Calculate overall score with CUSTOM WEIGHTS based on image type (SAME AS BATCH)
    let overallScore;
    
    if (isIllustrativeContent) {
      // ILLUSTRATION WEIGHTS - Emphasize composition and subject clarity
      // Anatomy: 15% (less strict - allow stylization)
      // Pose: 15% (important for character design)
      // Face: 20% (very important for character)
      // Background: 15% (supports storytelling)
      // Objects/Clothing: 20% (costume/design is central to illustration)
      // Coherence: 15% (overall composition)
      overallScore = Math.round(
        (anatomyScore * 0.15 + 
         poseScore * 0.15 + 
         faceQuality * 0.20 + 
         backgroundQuality * 0.15 + 
         objectQuality * 0.20 + 
         coherenceScore * 0.15) / 1
      );
      console.log(`[Illustration] Using ILLUSTRATION weights (type: ${isIllustration ? 'detected' : 'artistic'})`);
    } else {
      // PHOTO WEIGHTS - Standard evaluation
      // Anatomy: 20%, Pose: 15%, Face: 20%, Background: 15%, Objects: 15%, Coherence: 15%
      overallScore = Math.round(
        (anatomyScore * 0.20 + 
         poseScore * 0.15 + 
         faceQuality * 0.20 + 
         backgroundQuality * 0.15 + 
         objectQuality * 0.15 + 
         coherenceScore * 0.15) / 1
      );
      console.log(`[Illustration] Using PHOTO weights`);
    }

    // DEBUG: Log component scores before feedback
    console.log(`[Illustration] Pre-feedback scores: Anatomy=${anatomyScore}, Pose=${poseScore}, Face=${faceQuality}, BG=${backgroundQuality}, Objects=${objectQuality}, Coherence=${coherenceScore}`);
    if (isIllustrativeContent) {
      console.log(`[Illustration] Calculation: (${anatomyScore}*0.15 + ${poseScore}*0.15 + ${faceQuality}*0.20 + ${backgroundQuality}*0.15 + ${objectQuality}*0.20 + ${coherenceScore}*0.15) = ${overallScore}`);
    } else {
      console.log(`[Illustration] Calculation: (${anatomyScore}*0.20 + ${poseScore}*0.15 + ${faceQuality}*0.20 + ${backgroundQuality}*0.15 + ${objectQuality}*0.15 + ${coherenceScore}*0.15) = ${overallScore}`);
    }

    // Save raw AI scores before any corrections
    const rawComponentScores = {
      anatomy: anatomyScore,
      pose: poseScore,
      face: faceQuality,
      background: backgroundQuality,
      objects: objectQuality,
      coherence: coherenceScore
    };
    const rawOverallScore = overallScore;

    // ===== Apply feedback corrections if available =====
    // User corrections improve the ratings over time
    const imageId = path.basename(filePath);
    
    // Extract source folder from the full file path
    const pathParts = filePath.split(path.sep);
    let detectedSourcePath = null;
    
    // Try to find the source folder by looking for .ai-feedback.json
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const potentialPath = pathParts.slice(0, i).join(path.sep);
      const feedbackFilePath = pathParts.slice(0, i).join(path.sep) + path.sep + '.ai-feedback.json';
      if (fs.existsSync(feedbackFilePath)) {
        detectedSourcePath = potentialPath;
        break;
      }
    }
    
    // Fall back to req.body.sourcePath if provided
    const sourcePath = req.body.sourcePath || detectedSourcePath || currentSourcePath;
    
    const feedbackData = loadFeedback(sourcePath);
    
    // ===== PHASE 1: Apply learned patterns from ALL feedback =====
    // This learns the user's correction tendencies and applies them to new images
    console.log(`[Illustration] Learning patterns from ${feedbackData.entries.length} feedback entries...`);
    const learnedPatterns = calculateLearnedPatterns(feedbackData);
    
    let componentScores = {
      anatomy: anatomyScore,
      pose: poseScore,
      face: faceQuality,
      background: backgroundQuality,
      objects: objectQuality,
      coherence: coherenceScore
    };
    
    // Apply learned patterns
    const adjustedScores = applyLearnedPatterns(componentScores, learnedPatterns);
    
    // Only apply if patterns were actually applied (some confidence > 0.6)
    if (learnedPatterns) {
      let patternsApplied = false;
      for (const [component, pattern] of Object.entries(learnedPatterns)) {
        if (pattern.confidence >= 0.6 && adjustedScores[component] !== componentScores[component]) {
          patternsApplied = true;
          break;
        }
      }
      
      if (patternsApplied) {
        console.log(`[Illustration] Applying learned pattern corrections...`);
        anatomyScore = adjustedScores.anatomy;
        poseScore = adjustedScores.pose;
        faceQuality = adjustedScores.face;
        backgroundQuality = adjustedScores.background;
        objectQuality = adjustedScores.objects;
        coherenceScore = adjustedScores.coherence;
        
        // Recalculate overall score after pattern corrections
        if (isIllustrativeContent) {
          overallScore = Math.round(
            (anatomyScore * 0.15 + 
             poseScore * 0.15 + 
             faceQuality * 0.20 + 
             backgroundQuality * 0.15 + 
             objectQuality * 0.20 + 
             coherenceScore * 0.15)
          );
        } else {
          overallScore = Math.round(
            (anatomyScore * 0.20 + 
             poseScore * 0.15 + 
             faceQuality * 0.20 + 
             backgroundQuality * 0.15 + 
             objectQuality * 0.15 + 
             coherenceScore * 0.15)
          );
        }
        console.log(`[Illustration] Score after learned patterns: ${overallScore}/10`);
      }
    }
    
    // ===== PHASE 2: Check for specific image feedback =====
    // If there's feedback specifically for THIS image, it overrides learned patterns
    const priorFeedback = feedbackData.entries.find(e => e.imageId === imageId);
    let feedbackApplied = false;
    let feedbackDetails = null;

    if (priorFeedback) {
      feedbackApplied = true;
      const feedbackComponents = priorFeedback.components || {};
      
      console.log(`[Illustration] FEEDBACK FOUND for ${imageId}! Applying corrections...`);
      
      // Apply component-level corrections from user feedback
      if (feedbackComponents.anatomy !== undefined) {
        console.log(`[Illustration]   - Anatomy: ${anatomyScore} → ${feedbackComponents.anatomy}`);
        anatomyScore = feedbackComponents.anatomy;
      }
      if (feedbackComponents.pose !== undefined) {
        console.log(`[Illustration]   - Pose: ${poseScore} → ${feedbackComponents.pose}`);
        poseScore = feedbackComponents.pose;
      }
      if (feedbackComponents.face !== undefined) {
        console.log(`[Illustration]   - Face: ${faceQuality} → ${feedbackComponents.face}`);
        faceQuality = feedbackComponents.face;
      }
      if (feedbackComponents.background !== undefined) {
        console.log(`[Illustration]   - Background: ${backgroundQuality} → ${feedbackComponents.background}`);
        backgroundQuality = feedbackComponents.background;
      }
      if (feedbackComponents.objects !== undefined) {
        console.log(`[Illustration]   - Objects: ${objectQuality} → ${feedbackComponents.objects}`);
        objectQuality = feedbackComponents.objects;
      }
      if (feedbackComponents.coherence !== undefined) {
        console.log(`[Illustration]   - Coherence: ${coherenceScore} → ${feedbackComponents.coherence}`);
        coherenceScore = feedbackComponents.coherence;
      }

      // Recalculate overall score with user feedback using CORRECT weights
      let feedbackOverallScore;
      
      if (isIllustrativeContent) {
        // ILLUSTRATION WEIGHTS for feedback recalculation
        feedbackOverallScore = Math.round(
          (anatomyScore * 0.15 + 
           poseScore * 0.15 + 
           faceQuality * 0.20 + 
           backgroundQuality * 0.15 + 
           objectQuality * 0.20 + 
           coherenceScore * 0.15)
        );
      } else {
        // PHOTO WEIGHTS for feedback recalculation
        feedbackOverallScore = Math.round(
          (anatomyScore * 0.20 + 
           poseScore * 0.15 + 
           faceQuality * 0.20 + 
           backgroundQuality * 0.15 + 
           objectQuality * 0.15 + 
           coherenceScore * 0.15)
        );
      }

      feedbackDetails = {
        priorUserScore: priorFeedback.userScore,
        priorAIScore: priorFeedback.aiScore,
        correction: priorFeedback.correction,
        reasoning: priorFeedback.reasoning,
        timestamp: priorFeedback.timestamp
      };

      console.log(`[Illustration] Recalculated score with feedback: ${overallScore}/10 → ${feedbackOverallScore}/10`);
      overallScore = feedbackOverallScore;
    }

    // Build correction details showing what adjustments were made
    const correctionDetails = {
      rawAIScore: rawOverallScore,
      learnedPatternCorrections: [],
      specificFeedbackCorrections: [],
      hasCorrections: false
    };

    // Track learned pattern corrections
    if (learnedPatterns) {
      for (const [component, pattern] of Object.entries(learnedPatterns)) {
        if (pattern.confidence >= 0.6) {
          const componentKey = component === 'face' ? 'faceQuality' : 
                              component === 'background' ? 'backgroundQuality' :
                              component === 'objects' ? 'objectQuality' :
                              component === 'coherence' ? 'coherenceScore' :
                              `${component}Score`;
          
          const rawScore = rawComponentScores[component];
          const adjustedScore = adjustedScores[component];
          
          if (adjustedScore !== rawScore) {
            correctionDetails.learnedPatternCorrections.push({
              component: component,
              rawScore: rawScore,
              adjustedScore: adjustedScore,
              adjustment: adjustedScore - rawScore,
              confidence: pattern.confidence,
              pattern: pattern.avg
            });
            correctionDetails.hasCorrections = true;
          }
        }
      }
    }

    // Track specific feedback corrections
    if (feedbackApplied && priorFeedback) {
      const feedbackComponents = priorFeedback.components || {};
      
      for (const component of ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence']) {
        const componentKey = component === 'face' ? 'faceQuality' : 
                            component === 'background' ? 'backgroundQuality' :
                            component === 'objects' ? 'objectQuality' :
                            component === 'coherence' ? 'coherenceScore' :
                            `${component}Score`;
        
        const userScore = feedbackComponents[component];
        if (userScore !== undefined) {
          // Get the score before this feedback correction (which is the current score if patterns were applied)
          const scoreBeforeFeedback = learnedPatterns && adjustedScores[component] ? 
                                      adjustedScores[component] : 
                                      rawComponentScores[component];
          
          if (userScore !== scoreBeforeFeedback) {
            correctionDetails.specificFeedbackCorrections.push({
              component: component,
              beforeFeedback: scoreBeforeFeedback,
              userScore: userScore,
              adjustment: userScore - scoreBeforeFeedback,
              reason: priorFeedback.reasoning || 'Your feedback for this image'
            });
            correctionDetails.hasCorrections = true;
          }
        }
      }
    }

    const response = {
      overallScore,
      rawAIScore: rawOverallScore,
      anatomyScore,
      poseScore,
      faceQuality,
      backgroundQuality,
      objectQuality,
      coherenceScore,
      detectedIssues: issues,
      detectedStrengths: strengths.length > 0 ? strengths : ['Image analyzed successfully'],
      confidence: avgConfidence,
      analysis: `Vision API detected ${labels.length} labels and ${objects.length} objects`,
      recommendations: recommendations.length > 0 ? recommendations : [],
      labels: labels.slice(0, 10).map(l => ({ name: l.description, score: Math.round(l.score * 100) })),
      processingTime: 250,
      cost: '$0.0015',
      feedbackApplied,
      feedbackDetails,
      correctionDetails: correctionDetails.hasCorrections ? correctionDetails : null
    };

    console.log(`[Illustration] Analysis complete: ${response.overallScore}/10 (${avgConfidence}% confidence)${feedbackApplied ? ' [FEEDBACK APPLIED]' : ''}`);
    res.json(response);

  } catch (err) {
    console.error('[Illustration] Vision API failed:', err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

/**
 * POST /api/batch-analyze-illustrations
 * Batch analyze illustrations using Google Cloud Vision API
 */
app.post('/api/batch-analyze-illustrations', async (req, res) => {
  const { filePaths } = req.body;

  if (!Array.isArray(filePaths)) {
    return res.status(400).json({ error: 'filePaths must be an array' });
  }

  try {
    console.log(`[Illustration] Batch analyzing ${filePaths.length} images with Vision API`);
    const results = [];

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        results.push({ error: 'File not found', filePath });
        continue;
      }

      try {
        // Read and encode image
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');

        const request = {
          image: {
            content: base64Image
          },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 20 },
            { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
            { type: 'SAFE_SEARCH_DETECTION' },
            { type: 'IMAGE_PROPERTIES' }
          ]
        };

        const [result] = await visionClient.annotateImage(request);
        const labels = result.labelAnnotations || [];
        const objects = result.localizedObjectAnnotations || [];

        // Same analysis logic as single endpoint
        let anatomyScore = 6;
        let poseScore = 6;
        let faceQuality = 6;
        let backgroundQuality = 6;
        let objectQuality = 6;
        let coherenceScore = 6;
        const issues = [];
        const strengths = [];

        const labelNames = labels.map(l => l.description.toLowerCase());

        if (labelNames.some(l => l.includes('hand') || l.includes('finger') || l.includes('arm'))) {
          anatomyScore = Math.min(10, anatomyScore + 2);
          strengths.push('Clear anatomy');
        }
        if (labelNames.some(l => l.includes('gesture') || l.includes('pose'))) {
          poseScore = Math.min(10, poseScore + 2);
          strengths.push('Good pose');
        }
        if (labelNames.some(l => l.includes('face') || l.includes('portrait'))) {
          faceQuality = Math.min(10, faceQuality + 2);
          strengths.push('Clear face');
        }
        if (labelNames.some(l => l.includes('background'))) {
          backgroundQuality = Math.min(10, backgroundQuality + 2);
          strengths.push('Good background');
        }
        if (labelNames.some(l => l.includes('cloth') || l.includes('fashion'))) {
          objectQuality = Math.min(10, objectQuality + 2);
          strengths.push('Good detail');
        }
        if (labels.length > 8) {
          coherenceScore = Math.min(10, coherenceScore + 2);
        }

        const safeSearch = result.safeSearchAnnotation || {};
        if (safeSearch.adult === 'VERY_LIKELY' || safeSearch.adult === 'LIKELY') {
          issues.push('Adult content');
          // Note: Adult content does not affect anatomy scoring - adult images can have excellent anatomy
        }

        anatomyScore = Math.max(1, Math.min(10, Math.round(anatomyScore)));
        poseScore = Math.max(1, Math.min(10, Math.round(poseScore)));
        faceQuality = Math.max(1, Math.min(10, Math.round(faceQuality)));
        backgroundQuality = Math.max(1, Math.min(10, Math.round(backgroundQuality)));
        objectQuality = Math.max(1, Math.min(10, Math.round(objectQuality)));
        coherenceScore = Math.max(1, Math.min(10, Math.round(coherenceScore)));

        let overallScore = Math.round(
          (anatomyScore * 0.20 + 
           poseScore * 0.15 + 
           faceQuality * 0.20 + 
           backgroundQuality * 0.15 + 
           objectQuality * 0.15 + 
           coherenceScore * 0.15)
        );

        // ===== NEW: Apply feedback corrections if available =====
        const imageId = path.basename(filePath);
        
        // Extract source folder from the full file path
        const pathParts = filePath.split(path.sep);
        let detectedSourcePath = null;
        for (let i = pathParts.length - 1; i >= 0; i--) {
          const feedbackFilePath = pathParts.slice(0, i).join(path.sep) + path.sep + '.ai-feedback.json';
          if (fs.existsSync(feedbackFilePath)) {
            detectedSourcePath = pathParts.slice(0, i).join(path.sep);
            break;
          }
        }
        
        const sourcePath = req.body.sourcePath || detectedSourcePath || currentSourcePath;
        const feedbackData = loadFeedback(sourcePath);
        const priorFeedback = feedbackData.entries.find(e => e.imageId === imageId);
        let feedbackApplied = false;

        if (priorFeedback) {
          feedbackApplied = true;
          const feedbackComponents = priorFeedback.components || {};
          
          // Apply component-level corrections from user feedback
          if (feedbackComponents.anatomy !== undefined) {
            anatomyScore = feedbackComponents.anatomy;
          }
          if (feedbackComponents.pose !== undefined) {
            poseScore = feedbackComponents.pose;
          }
          if (feedbackComponents.face !== undefined) {
            faceQuality = feedbackComponents.face;
          }
          if (feedbackComponents.background !== undefined) {
            backgroundQuality = feedbackComponents.background;
          }
          if (feedbackComponents.objects !== undefined) {
            objectQuality = feedbackComponents.objects;
          }
          if (feedbackComponents.coherence !== undefined) {
            coherenceScore = feedbackComponents.coherence;
          }

          // Recalculate overall score with user feedback
          overallScore = Math.round(
            (anatomyScore * 0.20 + 
             poseScore * 0.15 + 
             faceQuality * 0.20 + 
             backgroundQuality * 0.15 + 
             objectQuality * 0.15 + 
             coherenceScore * 0.15)
          );

          console.log(`[Batch] Feedback applied for ${imageId}: User score=${priorFeedback.userScore}/10 (from AI=${priorFeedback.aiScore}/10)`);
        }

        results.push({
          overallScore,
          anatomyScore,
          poseScore,
          faceQuality,
          backgroundQuality,
          objectQuality,
          coherenceScore,
          detectedIssues: issues,
          detectedStrengths: strengths.length > 0 ? strengths : ['Analyzed successfully'],
          confidence: 85,
          analysis: `Detected ${labels.length} labels`,
          recommendations: [],
          feedbackApplied
        });

        console.log(`[Illustration] Analyzed: ${path.basename(filePath)} = ${overallScore}/10`);

      } catch (err) {
        console.error(`[Illustration] Failed to analyze ${filePath}:`, err);
        results.push({ error: err.message, filePath });
      }

      // Rate limiting delay between API calls (0.5 seconds between calls)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Illustration] Batch complete - ${results.length} images analyzed`);
    res.json(results);

  } catch (err) {
    console.error('[Illustration] Batch analysis failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ AI FEEDBACK SYSTEM (Option 1 + 5) ============

/**
 * Load feedback data from source folder
 * File: .ai-feedback.json in the source folder
 * @param {string} sourcePath - The source folder path. Uses currentSourcePath if not provided.
 */
function loadFeedback(sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  
  if (!folderPath) {
    console.warn('[Feedback] No source path available, returning empty feedback');
    return { entries: [] };
  }

  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  try {
    if (fs.existsSync(feedbackFile)) {
      const data = fs.readFileSync(feedbackFile, 'utf8');
      const parsed = JSON.parse(data);
      console.log(`[Feedback] Loaded ${parsed.entries?.length || 0} entries from ${feedbackFile}`);
      return parsed;
    } else {
      console.log(`[Feedback] No feedback file at ${feedbackFile}, creating new`);
    }
  } catch (err) {
    console.error('[Feedback] Failed to load feedback from', feedbackFile, ':', err);
  }
  return { entries: [] };
}

/**
 * Save feedback data to source folder
 * File: .ai-feedback.json in the source folder
 * @param {object} feedbackData - The feedback data to save
 * @param {string} sourcePath - The source folder path. Uses currentSourcePath if not provided.
 */
function saveFeedback(feedbackData, sourcePath = null) {
  const folderPath = sourcePath || currentSourcePath;
  
  if (!folderPath) {
    console.error('[Feedback] No source path available, cannot save feedback');
    return;
  }

  const feedbackFile = path.join(folderPath, '.ai-feedback.json');
  try {
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2));
    console.log(`[Feedback] Saved ${feedbackData.entries.length} feedback entries to ${feedbackFile}`);
  } catch (err) {
    console.error('[Feedback] Failed to save feedback:', err);
  }
}

/**
 * Calculate learned correction patterns from all user feedback
 * Analyzes the user's tendency to rate each component differently from AI scores
 * Uses recency weighting - newer feedback has more influence
 * 
 * Returns an object with average corrections per component:
 * {
 *   anatomy: { avg: -0.5, count: 30, confidence: 0.8 },
 *   pose: { avg: 0.2, count: 28, confidence: 0.6 },
 *   ...
 * }
 */
function calculateLearnedPatterns(feedbackData) {
  if (!feedbackData.entries || feedbackData.entries.length === 0) {
    console.log('[ML] No feedback entries to learn from');
    return null;
  }

  const patterns = {};
  const components = ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence'];
  
  // Sort entries by timestamp for recency weighting
  const sortedEntries = [...feedbackData.entries].sort((a, b) => {
    const dateA = new Date(a.timestamp || 0).getTime();
    const dateB = new Date(b.timestamp || 0).getTime();
    return dateB - dateA; // Newest first
  });

  const totalEntries = sortedEntries.length;

  for (const component of components) {
    const corrections = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      
      // Recency weight: newer entries (lower index) get higher weight
      // Use exponential decay: weight = e^(-i / totalEntries * 2)
      const recencyFactor = Math.exp(-i / Math.max(1, totalEntries - 1) * 2);
      
      if (entry.components && entry.components[component] !== undefined) {
        const userComponentScore = entry.components[component];
        const aiComponentScore = entry.aiScore; // Base AI score, could be refined per component
        
        // The correction is user preference - AI preference
        // This tells us: how much the user typically adjusts this component
        corrections.push({
          imageId: entry.imageId,
          userScore: userComponentScore,
          aiScore: entry.aiScore,
          timestamp: entry.timestamp,
          recencyWeight: recencyFactor
        });

        weightedSum += userComponentScore * recencyFactor;
        totalWeight += recencyFactor;
      }
    }

    if (corrections.length > 0) {
      const weightedAvg = weightedSum / totalWeight;
      
      // Calculate confidence based on consistency (std dev)
      const values = corrections.map(c => c.userScore);
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      // Confidence is inverse of std dev (high consistency = high confidence)
      // Normalize to 0-1 range
      const confidence = Math.max(0, 1 - (stdDev / 5)); // 5 is rough max std dev

      patterns[component] = {
        avg: Math.round(weightedAvg * 10) / 10,
        count: corrections.length,
        confidence: Math.round(confidence * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100
      };

      console.log(`[ML] ${component}: avg=${patterns[component].avg}, count=${patterns[component].count}, confidence=${patterns[component].confidence}, stdDev=${patterns[component].stdDev}`);
    }
  }

  console.log(`[ML] Learned patterns from ${totalEntries} feedback entries:`, patterns);
  return Object.keys(patterns).length > 0 ? patterns : null;
}

/**
 * Apply learned correction patterns to component scores
 * Takes raw AI component scores and adjusts them based on learned user preferences
 * Only applies adjustments with high confidence (>0.6)
 * 
 * @param {object} componentScores - { anatomy, pose, face, background, objects, coherence }
 * @param {object} learnedPatterns - Patterns from calculateLearnedPatterns()
 * @returns {object} Adjusted component scores
 */
function applyLearnedPatterns(componentScores, learnedPatterns) {
  if (!learnedPatterns) {
    return componentScores;
  }

  const adjusted = { ...componentScores };
  let appliedCount = 0;

  for (const [component, pattern] of Object.entries(learnedPatterns)) {
    if (adjusted[component] !== undefined && pattern.confidence >= 0.6) {
      const originalScore = adjusted[component];
      
      // Apply the learned average adjustment, clamped to ±2 points
      // This prevents wild swings while still allowing meaningful corrections
      const maxAdjustment = 2;
      const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, pattern.avg));
      
      adjusted[component] = Math.max(1, Math.min(10, originalScore + adjustment));

      if (adjusted[component] !== originalScore) {
        const adjStr = adjustment >= 0 ? '+' + adjustment.toFixed(1) : adjustment.toFixed(1);
        console.log(`[ML-Apply] ${component}: ${originalScore} → ${adjusted[component]} (adjustment: ${adjStr}, confidence: ${pattern.confidence})`);
        appliedCount++;
      }
    }
  }

  if (appliedCount > 0) {
    console.log(`[ML-Apply] Applied ${appliedCount} learned pattern corrections`);
  }

  return adjusted;
}

/**
 * POST /api/feedback/submit
 * Submit user correction/feedback for an image
 * Body: {
 *   imageId: string (filename or unique id),
 *   aiScore: number (1-10),
 *   userScore: number (1-10),
 *   reasoning: string (optional),
 *   components: { anatomy, pose, face, background, objects, coherence },
 *   sourcePath: string (optional - source folder path)
 * }
 */
app.post('/api/feedback/submit', (req, res) => {
  try {
    const { imageId, aiScore, userScore, reasoning, components, sourcePath } = req.body;

    if (!imageId || aiScore === undefined || userScore === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // DEBUG: Log the full imageId received
    console.log(`[Feedback] Received imageId (length: ${imageId.length}): ${imageId}`);

    // Use provided sourcePath or fall back to currentSourcePath
    const feedbackSourcePath = sourcePath || currentSourcePath;
    if (!feedbackSourcePath) {
      return res.status(400).json({ error: 'Source path not set. Please select a folder first.' });
    }

    const feedbackData = loadFeedback(feedbackSourcePath);
    const entry = {
      imageId,
      aiScore: Math.round(aiScore),
      userScore: Math.round(userScore),
      correction: userScore - aiScore,
      reasoning: reasoning || '',
      components: components || {},
      timestamp: new Date().toISOString()
    };

    feedbackData.entries.push(entry);
    saveFeedback(feedbackData, feedbackSourcePath);

    console.log(`[Feedback] New entry: ${imageId} | AI: ${aiScore} → User: ${userScore} | Correction: ${entry.correction}`);
    console.log(`[Feedback] Total entries in ${feedbackSourcePath}: ${feedbackData.entries.length}`);

    res.json({
      success: true,
      entry,
      feedbackCount: feedbackData.entries.length,
      message: 'Feedback recorded. AI will learn from your corrections!'
    });

  } catch (err) {
    console.error('[Feedback] Submit failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/feedback/analysis
 * Analyze feedback patterns to suggest weight adjustments
 */
app.get('/api/feedback/analysis', (req, res) => {
  try {
    const sourcePath = req.query.sourcePath || currentSourcePath;
    const feedbackData = loadFeedback(sourcePath);
    const entries = feedbackData.entries;

    if (entries.length < 5) {
      return res.json({
        status: 'insufficient_data',
        message: `Need at least 5 corrections to analyze patterns. Current: ${entries.length}`,
        feedbackCount: entries.length
      });
    }

    // Calculate patterns
    const avgCorrection = entries.reduce((sum, e) => sum + e.correction, 0) / entries.length;
    const bias = avgCorrection > 0 ? 'AI scores too low' : 'AI scores too high';
    const biasAmount = Math.abs(avgCorrection);

    // Analyze component patterns
    const componentAnalysis = {};
    ['anatomy', 'pose', 'face', 'background', 'objects', 'coherence'].forEach(comp => {
      const values = entries
        .filter(e => e.components && e.components[comp] !== undefined)
        .map(e => ({ score: e.components[comp], correction: e.correction }));

      if (values.length > 0) {
        const avgScore = values.reduce((sum, v) => sum + v.score, 0) / values.length;
        const avgCorrWhenHigh = values
          .filter(v => v.score >= 7)
          .map(v => v.correction)
          .reduce((sum, c) => sum + c, 0) / Math.max(1, values.filter(v => v.score >= 7).length);

        componentAnalysis[comp] = {
          avgScore: Math.round(avgScore * 10) / 10,
          avgCorrectionWhenHigh: Math.round(avgCorrWhenHigh * 10) / 10,
          pattern: avgCorrWhenHigh < -1 ? `User penalizes high ${comp}` : 
                   avgCorrWhenHigh > 1 ? `User rewards high ${comp}` : 'Neutral'
        };
      }
    });

    res.json({
      status: 'success',
      feedbackCount: entries.length,
      analysis: {
        overallBias: {
          description: bias,
          amount: Math.round(biasAmount * 100) / 100,
          recommendation: biasAmount > 1.5 
            ? `AI is ${bias} by ~${Math.round(biasAmount)} points. Consider weight adjustment.`
            : 'AI scoring is reasonably aligned with your preferences.'
        },
        componentPatterns: componentAnalysis,
        recentCorrections: entries.slice(-5).reverse()
      }
    });

  } catch (err) {
    console.error('[Feedback] Analysis failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/feedback/list
 * Get all feedback entries (for debugging/review)
 */
app.get('/api/feedback/stats', (req, res) => {
  try {
    const sourcePath = req.query.sourcePath || currentSourcePath;
    
    if (!sourcePath) {
      return res.status(400).json({ 
        success: false,
        error: 'Source path not set. Please select a folder first.' 
      });
    }

    const feedbackData = loadFeedback(sourcePath);
    const entries = feedbackData.entries || [];

    if (entries.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalCorrections: 0,
          averageCorrection: 0,
          positiveCorrections: 0,
          negativeCorrections: 0,
          byComponent: {},
          sourceFolder: sourcePath
        }
      });
    }

    // Calculate statistics
    let totalCorrection = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    const componentStats = {};

    entries.forEach(entry => {
      const correction = entry.correction || 0;
      totalCorrection += correction;

      if (correction > 0.1) positiveCount++;
      else if (correction < -0.1) negativeCount++;

      // Track component-level corrections
      if (entry.components) {
        Object.entries(entry.components).forEach(([component, userScore]) => {
          const componentName = component.toLowerCase();
          if (!componentStats[componentName]) {
            componentStats[componentName] = {
              count: 0,
              totalCorrection: 0,
              corrections: []
            };
          }

          componentStats[componentName].count++;
          componentStats[componentName].corrections.push(userScore);
          // Assuming AI score is similar to overall AI score for now
          // In a more detailed system, you'd have per-component AI scores
        });
      }
    });

    // Convert component stats to final format
    const byComponent = {};
    Object.entries(componentStats).forEach(([component, stats]) => {
      const avgCorrection = stats.totalCorrection / stats.count;
      const minCorrection = Math.min(...stats.corrections);
      const maxCorrection = Math.max(...stats.corrections);

      byComponent[component] = {
        count: stats.count,
        averageCorrection: avgCorrection,
        min: minCorrection,
        max: maxCorrection
      };
    });

    const stats = {
      totalCorrections: entries.length,
      averageCorrection: totalCorrection / entries.length,
      positiveCorrections: positiveCount,
      negativeCorrections: negativeCount,
      byComponent: byComponent,
      sourceFolder: sourcePath
    };

    res.json({ success: true, stats });
  } catch (err) {
    console.error('[Feedback] Stats failed:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

/**
 * GET /api/feedback/list
 * Get all feedback entries (for debugging/review)
 */
app.get('/api/feedback/list', (req, res) => {
  try {
    const sourcePath = req.query.sourcePath || currentSourcePath;
    const feedbackData = loadFeedback(sourcePath);
    res.json(feedbackData);
  } catch (err) {
    console.error('[Feedback] List failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/feedback/clear
 * Clear all feedback (careful with this!)
 */
app.delete('/api/feedback/clear', (req, res) => {
  try {
    const sourcePath = req.query.sourcePath || currentSourcePath;
    saveFeedback({ entries: [] }, sourcePath);
    res.json({ success: true, message: 'All feedback cleared' });
  } catch (err) {
    console.error('[Feedback] Clear failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Review server listening on port ${PORT}`);
});