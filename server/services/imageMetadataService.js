/**
 * Image Metadata Service
 * Extracts metadata from image files (PNG text chunks, filenames, etc.)
 * Pure business logic - no HTTP code
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('../utils/logger');

const TAG = 'ImageMetadataService';

class ImageMetadataService {
  /**
   * Extract prompt for Novel AI image generation request
   * Extracts the raw prompt field from PNG metadata for re-generation
   * Returns only the prompt string needed for the Novel AI API request
   */
  extractBasicPrompt(imagePath) {
    try {
      if (!fs.existsSync(imagePath)) {
        logger.warn(TAG, `Image not found: ${imagePath}`);
        return null;
      }

      let prompt = null;
      const filename = path.basename(imagePath);

      // Try to read embedded PNG metadata first
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = this.readPNGMetadata(imageBuffer);

        // Look for Comment chunk which typically contains JSON with generation parameters
        if (metadata.comment) {
          try {
            const commentData = JSON.parse(metadata.comment);
            // For Novel AI generation, use the raw prompt field if available
            if (commentData.prompt) {
              prompt = commentData.prompt;
            } else if (commentData.v4_prompt) {
              // Fallback: extract from v4_prompt if raw prompt not available
              prompt = commentData.v4_prompt.caption.base_caption;
              if(commentData.v4_prompt.caption.char_captions && commentData.v4_prompt.caption.char_captions.length > 0) {
                prompt += ', ' + commentData.v4_prompt.caption.char_captions.map(c => c.char_caption).join(', ');
              }
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
        logger.warn(TAG, `Could not read embedded PNG metadata: ${err.message}`);
      }

      // Fall back to extracting from filename if no embedded metadata found
      if (!prompt) {
        const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
        if (match) {
          prompt = match[1];
        }
      }

      logger.debug(TAG, `Extracted prompt for Novel AI generation: ${filename}`);
      return prompt || null;
    } catch (err) {
      logger.error(TAG, `Error extracting prompt for Novel AI generation: ${err.message}`);
      throw err;
    }
  }

  /**
   * Extract metadata from an image file
   * Tries PNG embedded metadata first, then filename
   */
  extractMetadata(imagePath) {
    try {
      if (!fs.existsSync(imagePath)) {
        logger.warn(TAG, `Image not found: ${imagePath}`);
        return null;
      }

      let prompt = null;
      let generationData = null;
      const filename = path.basename(imagePath);

      // Try to read embedded PNG metadata first
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = this.readPNGMetadata(imageBuffer);

        // Look for Comment chunk which typically contains JSON with generation parameters
        if (metadata.comment) {
          try {
            const commentData = JSON.parse(metadata.comment);
            if (commentData.v4_prompt) {
              prompt = commentData.v4_prompt.caption.base_caption;
              if(commentData.v4_prompt.caption.char_captions && commentData.v4_prompt.caption.char_captions.length > 0) {
                prompt += ', ' + commentData.v4_prompt.caption.char_captions.map(c => c.char_caption).join(', ');
              }
              generationData = commentData;
            } else if (commentData.prompt) {
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
        logger.warn(TAG, `Could not read embedded PNG metadata: ${err.message}`);
      }

      // Fall back to extracting from filename if no embedded metadata found
      if (!prompt) {
        const match = filename.match(/^(.+?)\s+s-\d+\.png$/i);
        if (match) {
          prompt = match[1];
        }
      }

      logger.debug(TAG, `Extracted metadata for: ${filename}`);

      return {
        filename: filename,
        prompt: prompt || null,
        generationData: generationData || undefined
      };
    } catch (err) {
      logger.error(TAG, `Error extracting metadata: ${err.message}`);
      throw err;
    }
  }

  /**
   * Read PNG text chunks from buffer
   * Handles tEXt, zTXt, and iTXt chunk types
   */
  readPNGMetadata(buffer) {
    const metadata = {};

    // PNG file signature: 137 80 78 71 13 10 26 10
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Check PNG signature - return empty metadata if not PNG instead of throwing
    if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
      logger.debug(TAG, 'File is not a valid PNG');
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
        this._processTEXtChunk(chunkData, metadata);
      } else if (chunkType === 'zTXt') {
        this._processZTXtChunk(chunkData, metadata);
      } else if (chunkType === 'iTXt') {
        this._processITXtChunk(chunkData, metadata);
      } else if (chunkType === 'IEND') {
        // End of PNG file
        break;
      }
    }

    return metadata;
  }

  /**
   * Process uncompressed text chunk (tEXt)
   * Format: keyword (null-terminated) + text data
   */
  _processTEXtChunk(chunkData, metadata) {
    const nullIndex = chunkData.indexOf(0);
    if (nullIndex > 0) {
      const keyword = chunkData.toString('latin1', 0, nullIndex);
      const text = chunkData.toString('utf-8', nullIndex + 1);
      metadata[keyword.toLowerCase()] = text;
      logger.trace(TAG, `Processed tEXt chunk: ${keyword}`);
    }
  }

  /**
   * Process compressed text chunk (zTXt)
   * Format: keyword (null-terminated) + compression method + compressed text
   */
  _processZTXtChunk(chunkData, metadata) {
    const nullIndex = chunkData.indexOf(0);
    if (nullIndex > 0) {
      const keyword = chunkData.toString('latin1', 0, nullIndex);
      const compressionMethod = chunkData[nullIndex + 1];
      if (compressionMethod === 0) { // DEFLATE
        try {
          const compressedText = chunkData.slice(nullIndex + 2);
          const decompressed = zlib.inflateSync(compressedText);
          const text = decompressed.toString('utf-8');
          metadata[keyword.toLowerCase()] = text;
          logger.trace(TAG, `Decompressed zTXt chunk: ${keyword}`);
        } catch (e) {
          logger.warn(TAG, `Failed to decompress zTXt chunk: ${e.message}`);
        }
      }
    }
  }

  /**
   * Process international text chunk (iTXt)
   * Format: keyword (null-terminated) + compression flag + compression method + language tag + translated keyword + text
   */
  _processITXtChunk(chunkData, metadata) {
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
            logger.trace(TAG, `Processed iTXt chunk: ${keyword}`);
          }
        }
      } else if (compressionFlag === 1) { // Compressed with DEFLATE
        try {
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
              logger.trace(TAG, `Decompressed iTXt chunk: ${keyword}`);
            }
          }
        } catch (e) {
          logger.warn(TAG, `Failed to decompress iTXt chunk: ${e.message}`);
        }
      }
    }
  }

  /**
   * Extract artist tags from prompt text
   * Looks for patterns like {artist: name}, [artist:name], artist:name, etc.
   * Preserves bracket types and returns artists in order of appearance
   */
  extractArtistTags(prompt) {
    if (!prompt) return [];

    const artists = []; // Use array to preserve order, not Set

    // Match patterns like {artist: name}, [artist:name], artist:name, etc.
    // CAPTURE the brackets too so we can preserve them
    const pattern = /([{\[\(]*)\s*artist:\s*([^}\]\),]+)\s*([}\]\)]*)/gi;

    let match;
    while ((match = pattern.exec(prompt)) !== null) {
      const openBrackets = match[1]; // e.g., "{", "[", "{{{", ""
      const artistName = match[2].trim(); // e.g., "alice"
      const closeBrackets = match[3]; // e.g., "}", "]", "}}}", ""

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

  /**
   * Normalize a prompt by removing artist tags and normalizing formatting
   * Removes all artist tag patterns and normalizes spacing and punctuation
   */
  normalizePrompt(prompt) {
    if (!prompt) return '';

    // Remove all artist tag patterns:
    // {artist: ...}, [artist: ...}, artist: ..., etc.
    let normalized = prompt
      .replace(/\{+artist:\s*[^}]*\}+/gi, '') // {artist: ...}
      .replace(/\[artist:\s*[^\]]*\]/gi, '') // [artist: ...]
      .replace(/artist:\s*[^,})\]]+/gi, '') // artist: ... (standalone)
      .replace(/,+\s*/g, ', ') // normalize commas
      .replace(/\s+/g, ' ') // normalize spaces
      .trim();

    // Remove leading/trailing commas and spaces
    normalized = normalized.replace(/^[\s,]+|[\s,]+$/g, '');

    return normalized.toLowerCase();
  }

  /**
   * Check if filename is a macOS system file
   */
  isMacSystemFile(filename) {
    return filename.startsWith('._') || filename === '.DS_Store' || filename.startsWith('.~');
  }
}

module.exports = ImageMetadataService;
