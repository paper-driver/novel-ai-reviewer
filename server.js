const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Paths for data and generated image storage
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
const GENERATED_DIR = path.join(__dirname, 'generated');

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
    const { sourcePath, destinationPath } = req.body;
    
    // Validate input
    if (!sourcePath || !destinationPath) {
      return res.status(400).json({ error: 'Both sourcePath and destinationPath are required' });
    }
    
    // Resolve and normalize paths
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedDestPath = path.resolve(destinationPath);
    
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
    
    // STEP 5: Update and write mapping file with all folders (old + new)
    fs.writeFileSync(mappingFile, JSON.stringify(artistKeyToFolder, null, 2));
    
    res.json({
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

app.listen(PORT, () => {
  console.log(`Review server listening on port ${PORT}`);
});