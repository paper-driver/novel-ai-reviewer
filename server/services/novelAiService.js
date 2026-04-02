/**
 * Novel AI Service
 * Handles integration with Novel AI API for automatic image generation
 * Extracts prompts from base image metadata, adds artist tags, and sends requests to Novel AI
 * Pure business logic - no HTTP code
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const logger = require('../utils/logger');

const TAG = 'NovelAiService';
const NOVEL_AI_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
const DEFAULT_MODEL = 'nai-diffusion-4-5-full';

class NovelAiService {
  constructor(apiKey, logger) {
    this.apiKey = apiKey;
    this.logger = logger;

    if (!apiKey) {
      logger.warn(TAG, 'No Novel AI API key provided');
    }
  }

  /**
   * Extract prompt from base image metadata
   * @param {Object} metadata - Metadata object from ImageMetadataService
   * @returns {string} - Extracted prompt or default
   */
  extractPromptFromMetadata(metadata) {
    if (!metadata) {
      const fallback = '1girl, masterpiece, best quality';
      this.logger.warn(TAG, 'Metadata is null, using fallback prompt');
      return fallback;
    }

    // ImageMetadataService returns { prompt, generationData, ... }
    // Try prompt field first, then fall back
    const prompt = metadata.prompt || metadata.comment;
    
    if (!prompt) {
      const fallback = '1girl, masterpiece, best quality';
      this.logger.warn(TAG, 'Metadata prompt not found, using fallback prompt');
      return fallback;
    }

    // Return the prompt as-is (preserve all special characters)
    return prompt.trim();
  }

  /**
   * Build final prompt with artist tag at the top
   * @param {string} comment - Base prompt from metadata
   * @param {string} artistName - Artist name to prepend
   * @returns {string} - Final prompt with artist tag
   */
  buildArtistTaggedPrompt(comment, artistName) {
    if (!comment || !artistName) {
      throw new Error('Comment and artist name are required');
    }

    // Artist tag MUST be at the very top
    // Format: "artist: {artistName}, {comment}"
    return `artist: ${artistName}, ${comment}`;
  }

  /**
   * Build complete request payload for Novel AI API
   * @param {Object} metadata - Base image metadata (or null)
   * @param {string} artistName - Artist name to add to prompt
   * @param {string} basicPrompt - Basic prompt from image metadata
   * @param {Object} overrideParams - Optional parameter overrides
   * @returns {Object} - Complete API request payload
   */
  buildPayload(metadata, artistName, basicPrompt, overrideParams = {}) {
    try {
      // Use provided basicPrompt for generation
      const modifiedBasicPrompt = this.buildArtistTaggedPrompt(basicPrompt, artistName);

      // Get generation parameters from metadata
      // ImageMetadataService returns { prompt, generationData, ... }
      // generationData contains all the parameters from the PNG metadata
      const params = metadata?.generationData || metadata?.parameters || {};

      // Apply any overrides (e.g., different model)
      const comment = {
        ...params,          // Start with metadata parameters
        ...overrideParams   // Override with any provided overrides
      };

      // Build the API request body
      const payload = {
        input: modifiedBasicPrompt,
        model: comment.model || DEFAULT_MODEL,
        parameters: {
          // Core generation parameters
          width: comment.width || 832,
          height: comment.height || 1216,
          steps: comment.steps || 28,
          scale: comment.scale || 5.0,
          sampler: comment.sampler || 'k_euler_ancestral',
          seed: comment.seed || Math.floor(Math.random() * 4294967295),
          n_samples: comment.n_samples || 1,
          noise_schedule: comment.noise_schedule || 'karras',

          // Optional but preserve from metadata
          cfg_rescale: comment.cfg_rescale !== undefined ? comment.cfg_rescale : 0.0,
          dynamic_thresholding: comment.dynamic_thresholding || false,
          dynamic_thresholding_percentile: comment.dynamic_thresholding_percentile || 0.999,
          dynamic_thresholding_mimic_scale: comment.dynamic_thresholding_mimic_scale || 10.0,
          skip_cfg_below_sigma: comment.skip_cfg_below_sigma || 0.0,
          skip_cfg_above_sigma: comment.skip_cfg_above_sigma || null,
          legacy_v3_extend: comment.legacy_v3_extend || false,

          // Sampler options
          sm: comment.sm || false,
          sm_dyn: comment.sm_dyn || false,
          prefer_brownian: comment.prefer_brownian !== undefined ? comment.prefer_brownian : true,
          deliberate_euler_ancestral_bug: comment.deliberate_euler_ancestral_bug || false,

          // ControlNet (usually disabled)
          controlnet_model: comment.controlnet_model || null,
          controlnet_strength: comment.controlnet_strength || 1.0,

          // Reference images (usually empty)
          reference_image_multiple: comment.reference_image_multiple || [],
          reference_information_extracted_multiple: comment.reference_information_extracted_multiple || [],
          reference_strength_multiple: comment.reference_strength_multiple || [],

          // Director mode (usually disabled)
          director_reference_images: comment.director_reference_images || null,
          director_reference_descriptions: comment.director_reference_descriptions || null,
          director_reference_information_extracted: comment.director_reference_information_extracted || null,
          director_reference_strength_values: comment.director_reference_strength_values || null,
          director_reference_secondary_strength_values: comment.director_reference_secondary_strength_values || null,

          // Response format
          stream: comment.stream || 'msgpack',
        
          // negative prompt
          negative_prompt: comment.uc || comment.negative_prompt.caption.base_caption || '',
          // Advanced prompt structures (if present in metadata)
          ...(comment.v4_prompt && { v4_prompt: { ...comment.v4_prompt, caption: { ...comment.v4_prompt.caption, base_caption: modifiedBasicPrompt } } }),
          ...(comment.v4_negative_prompt && { v4_negative_prompt: comment.v4_negative_prompt })
        }
      };

      return payload;
    } catch (error) {
      this.logger.error(TAG, `Error building payload: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make HTTP POST request to Novel AI API
   * @param {Object} payload - Request payload
   * @returns {Promise<Buffer>} - ZIP file buffer from API response
   */
  makeGenerationRequest(payload) {
    return new Promise((resolve, reject) => {
      try {
        // Validate API key before making request
        if (!this.apiKey || this.apiKey.trim() === '') {
          const error = 'Novel AI API key is not set. Set NOVEL_AI_API_KEY environment variable.';
          this.logger.error(TAG, error);
          reject(new Error(error));
          return;
        }

        const requestBody = JSON.stringify(payload);
        this.logger.info(TAG, `Novel AI API request - Model: ${payload.model}, Prompt: "${payload.input.substring(0, 80)}..."`);
        this.logger.debug(TAG, `Request parameters - steps: ${payload.parameters.steps}, scale: ${payload.parameters.scale}, sampler: ${payload.parameters.sampler}`);
        this.logger.info(TAG, `Full request payload: ${JSON.stringify(payload, null, 2)}`);

        const options = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        };

        const req = https.request(NOVEL_AI_ENDPOINT, options, (res) => {
          let data = Buffer.alloc(0);

          // Accumulate response data
          res.on('data', (chunk) => {
            data = Buffer.concat([data, chunk]);
          });

          res.on('end', () => {
            // Accept both 200 and 201 as success responses
            if (res.statusCode === 200 || res.statusCode === 201) {
              // Success - return the ZIP buffer
              this.logger.info(TAG, `Novel AI API succeeded (HTTP ${res.statusCode}) - Received ${data.length} bytes`);
              resolve(data);
            } else {
              // Parse error response
              let errorMessage = `HTTP ${res.statusCode}`;
              let errorDetails = '';
              try {
                const errorData = JSON.parse(data.toString());
                errorMessage = errorData.message || errorData.error || errorMessage;
                errorDetails = JSON.stringify(errorData, null, 2);
              } catch (e) {
                // Not JSON, use raw data
                errorDetails = data.toString().slice(0, 1000);
              }
              this.logger.error(TAG, `Novel AI API failed: ${errorMessage}`);
              this.logger.error(TAG, `Error details: ${errorDetails}`);
              this.logger.error(TAG, `API Key present: ${this.apiKey ? 'YES' : 'NO'}, Key length: ${this.apiKey ? this.apiKey.length : 0}`);
              reject(new Error(`Novel AI API error: ${errorMessage}`));
            }
          });
        });

        req.on('error', (error) => {
          this.logger.error(TAG, `Request error: ${error.message}`);
          reject(error);
        });

        req.write(requestBody);
        req.end();
      } catch (error) {
        this.logger.error(TAG, `Error making request: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Extract PNG image from ZIP response
   * @param {Buffer} zipBuffer - ZIP file buffer from Novel AI API
   * @returns {Promise<Buffer>} - PNG image buffer
   */
  extractImageFromZip(zipBuffer) {
    return new Promise((resolve, reject) => {
      try {
        const { Readable } = require('stream');
        const unzipper = require('unzipper');
        
        let imageBuffer = null;
        const foundFiles = [];
        let entriesProcessed = 0;
        let entriesTotal = 0;

        const readable = Readable.from([zipBuffer]);
        readable
          .pipe(unzipper.Parse())
          .on('entry', (entry) => {
            foundFiles.push(entry.path);
            entriesTotal++;
            
            // Look for any image file
            const isImage = /\.(png|webp|jpg|jpeg)$/i.test(entry.path);
            
            if (isImage && !entry.path.endsWith('/') && !imageBuffer) {
              // Accept the first image found
              let chunks = [];
              entry.on('data', (chunk) => chunks.push(chunk));
              entry.on('end', () => {
                imageBuffer = Buffer.concat(chunks);
                this.logger.info(TAG, `Found image in ZIP: ${entry.path} (${imageBuffer.length} bytes)`);
                entriesProcessed++;
              });
            } else {
              entry.autodrain();
              entriesProcessed++;
            }
          })
          .on('finish', () => {
            this.logger.info(TAG, `ZIP extraction finished. Found files: ${JSON.stringify(foundFiles)}`);
            
            if (imageBuffer) {
              this.logger.info(TAG, `Extracted image from ZIP: ${imageBuffer.length} bytes`);
              resolve(imageBuffer);
            } else {
              this.logger.error(TAG, `No image found in ZIP. Files in archive: ${JSON.stringify(foundFiles)}`);
              reject(new Error('No image found in ZIP response'));
            }
          })
          .on('error', (error) => {
            this.logger.error(TAG, `Error extracting ZIP: ${error.message}`);
            reject(error);
          });
      } catch (error) {
        this.logger.error(TAG, `Error extracting image: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Save generated image to disk
   * @param {Buffer} imageBuffer - Image data
   * @param {string} artistFolderPath - Path to artist's folder
   * @param {string} imageType - 'with_artist' or 'base'
   * @param {Object} metadata - Original metadata to include
   * @returns {Promise<string>} - Path to saved image
   */
  async saveGeneratedImage(imageBuffer, artistFolderPath, imageType, metadata) {
    try {
      // Create directory structure if needed
      const subfolder = imageType === 'with_artist' ? 'with_artist' : 'base';
      const imageFolderPath = path.join(artistFolderPath, subfolder);

      // Ensure directory exists
      if (!fs.existsSync(imageFolderPath)) {
        fs.mkdirSync(imageFolderPath, { recursive: true });
      }

      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `image_${timestamp}.png`;
      const imagePath = path.join(imageFolderPath, filename);

      // Write image file
      fs.writeFileSync(imagePath, imageBuffer);
      this.logger.info(TAG, `Saved generated image: ${imagePath}`);

      return imagePath;
    } catch (error) {
      this.logger.error(TAG, `Error saving image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create metadata file for generated image
   * @param {Object} originalMetadata - Metadata from base image
   * @param {string} artistName - Artist name used
   * @param {string} generationId - Generation job ID
   * @returns {Object} - Metadata object to save
   */
  createGenerationMetadata(originalMetadata, artistName, generationId) {
    const metadata = {
      ...originalMetadata,
      generatedWith: 'NovelAI',
      artistTag: artistName,
      generationId: generationId,
      generatedAt: new Date().toISOString(),
      fromBaseImage: originalMetadata ? true : false
    };

    return metadata;
  }
}

module.exports = NovelAiService;
