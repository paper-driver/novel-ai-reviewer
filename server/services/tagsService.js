/**
 * Tags Service
 * Generic service for managing tags in source folders
 * Designed to be reusable across reviews, artist gallery, prompt grouping, etc.
 * 
 * Tag object structure:
 * {
 *   id: "uuid",
 *   name: "string",
 *   color: "#HEX",
 *   createdAt: "iso-date"
 * }
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const TAG = 'TagsService';
const TAGS_FILENAME = '.tags.json';
const IMAGE_TAGS_FILENAME = '.imageTags.json';

class TagsService {
  /**
   * Get full path to .tags.json in a source folder
   */
  getTagsFilePath(sourceFolderPath) {
    return path.join(sourceFolderPath, TAGS_FILENAME);
  }

  /**
   * Get full path to .imageTags.json in a source folder
   */
  getImageTagsFilePath(sourceFolderPath) {
    return path.join(sourceFolderPath, IMAGE_TAGS_FILENAME);
  }

  /**
   * Load all tags from a source folder
   */
  loadTags(sourceFolderPath) {
    try {
      if (!sourceFolderPath) {
        logger.warn(TAG, 'Source folder path is empty');
        return [];
      }

      if (!fs.existsSync(sourceFolderPath)) {
        logger.warn(TAG, `Source folder not found: ${sourceFolderPath}`);
        return [];
      }

      const tagsPath = this.getTagsFilePath(sourceFolderPath);
      if (!fs.existsSync(tagsPath)) {
        logger.debug(TAG, `No tags file found in ${sourceFolderPath}`);
        return [];
      }

      const content = fs.readFileSync(tagsPath, 'utf8');
      const tags = JSON.parse(content || '[]');
      logger.debug(TAG, `Loaded ${tags.length} tags from ${sourceFolderPath}`);
      return tags;
    } catch (err) {
      logger.error(TAG, `Error loading tags: ${err.message}`);
      return [];
    }
  }

  /**
   * Save tags to a source folder
   */
  saveTags(sourceFolderPath, tags) {
    try {
      if (!sourceFolderPath || !fs.existsSync(sourceFolderPath)) {
        throw new Error(`Invalid source folder: ${sourceFolderPath}`);
      }

      const tagsPath = this.getTagsFilePath(sourceFolderPath);
      fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2));
      logger.info(TAG, `Saved ${tags.length} tags to ${sourceFolderPath}`);
    } catch (err) {
      logger.error(TAG, `Error saving tags: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get all tags from a source folder
   */
  getAllTags(sourceFolderPath) {
    return this.loadTags(sourceFolderPath);
  }

  /**
   * Get tag by ID
   */
  getTagById(sourceFolderPath, tagId) {
    const tags = this.loadTags(sourceFolderPath);
    return tags.find(t => t.id === tagId) || null;
  }

  /**
   * Create new tag
   */
  createTag(sourceFolderPath, tagData) {
    const tags = this.loadTags(sourceFolderPath);

    // Check if tag with same name already exists (case-insensitive)
    const existingTag = tags.find(t => t.name.toLowerCase() === tagData.name.toLowerCase());
    if (existingTag) {
      logger.warn(TAG, `Tag with name "${tagData.name}" already exists`);
      throw new Error(`Tag with name "${tagData.name}" already exists`);
    }

    const newTag = {
      id: uuidv4(),
      name: tagData.name,
      color: tagData.color || '#808080', // Default gray if no color specified
      createdAt: new Date().toISOString()
    };

    tags.push(newTag);
    this.saveTags(sourceFolderPath, tags);

    logger.info(TAG, `Created tag "${newTag.name}" with ID ${newTag.id}`);
    return newTag;
  }

  /**
   * Update tag
   */
  updateTag(sourceFolderPath, tagId, updates) {
    const tags = this.loadTags(sourceFolderPath);
    const index = tags.findIndex(t => t.id === tagId);

    if (index === -1) {
      throw new Error(`Tag not found: ${tagId}`);
    }

    // Check if new name conflicts with existing tags
    if (updates.name && updates.name.toLowerCase() !== tags[index].name.toLowerCase()) {
      const conflict = tags.find(t => t.id !== tagId && t.name.toLowerCase() === updates.name.toLowerCase());
      if (conflict) {
        throw new Error(`Tag with name "${updates.name}" already exists`);
      }
    }

    const updated = {
      ...tags[index],
      name: updates.name !== undefined ? updates.name : tags[index].name,
      color: updates.color !== undefined ? updates.color : tags[index].color,
      updatedAt: new Date().toISOString()
    };

    tags[index] = updated;
    this.saveTags(sourceFolderPath, tags);

    logger.info(TAG, `Updated tag ${tagId}`);
    return updated;
  }

  /**
   * Delete tag
   */
  deleteTag(sourceFolderPath, tagId) {
    const tags = this.loadTags(sourceFolderPath);
    const index = tags.findIndex(t => t.id === tagId);

    if (index === -1) {
      throw new Error(`Tag not found: ${tagId}`);
    }

    const deleted = tags[index];
    tags.splice(index, 1);
    this.saveTags(sourceFolderPath, tags);

    logger.info(TAG, `Deleted tag ${tagId} (${deleted.name})`);
    return deleted;
  }

  /**
   * Check if tags file exists
   */
  hasTagsFile(sourceFolderPath) {
    const tagsPath = this.getTagsFilePath(sourceFolderPath);
    return fs.existsSync(tagsPath);
  }

  /**
   * Load all image tags from a source folder
   * Returns: { [imageBasename]: string[] } - map of image filename to tag IDs
   */
  loadImageTags(sourceFolderPath) {
    try {
      if (!sourceFolderPath) {
        logger.warn(TAG, 'Source folder path is empty');
        return {};
      }

      if (!fs.existsSync(sourceFolderPath)) {
        logger.warn(TAG, `Source folder not found: ${sourceFolderPath}`);
        return {};
      }

      const imageTagsPath = this.getImageTagsFilePath(sourceFolderPath);
      if (!fs.existsSync(imageTagsPath)) {
        logger.debug(TAG, `No image tags file found in ${sourceFolderPath}`);
        return {};
      }

      const content = fs.readFileSync(imageTagsPath, 'utf8');
      const imageTags = JSON.parse(content || '{}');
      logger.debug(TAG, `Loaded image tags from ${sourceFolderPath}`);
      return imageTags;
    } catch (err) {
      logger.error(TAG, `Error loading image tags: ${err.message}`);
      return {};
    }
  }

  /**
   * Save image tags to a source folder
   */
  saveImageTags(sourceFolderPath, imageTags) {
    try {
      if (!sourceFolderPath || !fs.existsSync(sourceFolderPath)) {
        throw new Error(`Invalid source folder: ${sourceFolderPath}`);
      }

      const imageTagsPath = this.getImageTagsFilePath(sourceFolderPath);
      fs.writeFileSync(imageTagsPath, JSON.stringify(imageTags, null, 2));
      logger.info(TAG, `Saved image tags to ${sourceFolderPath}`);
    } catch (err) {
      logger.error(TAG, `Error saving image tags: ${err.message}`);
      throw err;
    }
  }

  /**
   * Add tag to image (by image filename/basename)
   */
  addTagToImage(sourceFolderPath, imageFilename, tagId) {
    const imageTags = this.loadImageTags(sourceFolderPath);
    const basename = path.basename(imageFilename);

    // Validate tag exists
    const tag = this.getTagById(sourceFolderPath, tagId);
    if (!tag) {
      throw new Error(`Tag not found: ${tagId}`);
    }

    // Initialize array if not exists
    if (!imageTags[basename]) {
      imageTags[basename] = [];
    }

    // Add tag if not already present
    if (!imageTags[basename].includes(tagId)) {
      imageTags[basename].push(tagId);
      this.saveImageTags(sourceFolderPath, imageTags);
      logger.info(TAG, `Added tag ${tagId} to image ${basename}`);
    } else {
      logger.debug(TAG, `Tag ${tagId} already assigned to image ${basename}`);
    }

    return imageTags[basename];
  }

  /**
   * Remove tag from image (by image filename/basename)
   */
  removeTagFromImage(sourceFolderPath, imageFilename, tagId) {
    const imageTags = this.loadImageTags(sourceFolderPath);
    const basename = path.basename(imageFilename);

    if (!imageTags[basename]) {
      logger.warn(TAG, `No tags found for image ${basename}`);
      return [];
    }

    const index = imageTags[basename].indexOf(tagId);
    if (index > -1) {
      imageTags[basename].splice(index, 1);
      
      // Clean up empty entries
      if (imageTags[basename].length === 0) {
        delete imageTags[basename];
      }

      this.saveImageTags(sourceFolderPath, imageTags);
      logger.info(TAG, `Removed tag ${tagId} from image ${basename}`);
    } else {
      logger.debug(TAG, `Tag ${tagId} not found on image ${basename}`);
    }

    return imageTags[basename] || [];
  }

  /**
   * Get tags for a specific image
   */
  getImageTags(sourceFolderPath, imageFilename) {
    const imageTags = this.loadImageTags(sourceFolderPath);
    const basename = path.basename(imageFilename);
    return imageTags[basename] || [];
  }

  /**
   * Get tag details for an image (with full tag information)
   */
  getImageTagDetails(sourceFolderPath, imageFilename) {
    const allTags = this.getAllTags(sourceFolderPath);
    const tagIds = this.getImageTags(sourceFolderPath, imageFilename);
    
    return allTags.filter(tag => tagIds.includes(tag.id));
  }

  /**
   * Filter images by tags (AND logic - image must have ALL selected tags)
   */
  filterImagesByTags(sourceFolderPath, imageFilenames, tagIds) {
    if (!tagIds || tagIds.length === 0) {
      return imageFilenames; // Return all if no filters
    }

    const imageTags = this.loadImageTags(sourceFolderPath);
    
    return imageFilenames.filter(image => {
      const basename = path.basename(image);
      const imageTags_forImage = imageTags[basename] || [];
      
      // Check if image has ALL selected tags (AND logic)
      return tagIds.every(tagId => imageTags_forImage.includes(tagId));
    });
  }

  /**
   * Get all images with a specific tag
   */
  getImagesWithTag(sourceFolderPath, tagId) {
    const imageTags = this.loadImageTags(sourceFolderPath);
    const images = [];

    for (const [image, tags] of Object.entries(imageTags)) {
      if (tags.includes(tagId)) {
        images.push(image);
      }
    }

    return images;
  }

  /**
   * Get union of all tags across multiple images
   * Returns: string[] - array of tag IDs that are assigned to at least one image
   */
  getUnionTagsForImages(sourceFolderPath, imageFilenames) {
    if (!imageFilenames || imageFilenames.length === 0) {
      return [];
    }

    const imageTags = this.loadImageTags(sourceFolderPath);
    const unionTagIds = new Set();

    for (const imageFilename of imageFilenames) {
      const basename = path.basename(imageFilename);
      const tagsForImage = imageTags[basename] || [];
      
      for (const tagId of tagsForImage) {
        unionTagIds.add(tagId);
      }
    }

    return Array.from(unionTagIds);
  }

  /**
   * Get full tag details for union of tags across multiple images
   */
  getUnionTagDetailsForImages(sourceFolderPath, imageFilenames) {
    const allTags = this.getAllTags(sourceFolderPath);
    const tagIds = this.getUnionTagsForImages(sourceFolderPath, imageFilenames);
    
    return allTags.filter(tag => tagIds.includes(tag.id));
  }

  /**
   * Assign a tag to multiple images
   * Returns: number of images tagged
   */
  addTagToMultipleImages(sourceFolderPath, imageFilenames, tagId) {
    // Validate tag exists
    const tag = this.getTagById(sourceFolderPath, tagId);
    if (!tag) {
      throw new Error(`Tag not found: ${tagId}`);
    }

    let count = 0;
    for (const imageFilename of imageFilenames) {
      const currentTags = this.addTagToImage(sourceFolderPath, imageFilename, tagId);
      count++;
    }

    return count;
  }

  /**
   * Remove a tag from multiple images
   * Returns: number of images untagged
   */
  removeTagFromMultipleImages(sourceFolderPath, imageFilenames, tagId) {
    let count = 0;
    for (const imageFilename of imageFilenames) {
      this.removeTagFromImage(sourceFolderPath, imageFilename, tagId);
      count++;
    }

    return count;
  }
}

module.exports = TagsService;
