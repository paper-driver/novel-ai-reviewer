/**
 * NLP Parsing Service
 * Parses natural language user input to extract artist preferences and attributes
 */
class NLPParsingService {
  constructor() {
    this.artStyleKeywords = {
      'fine-art': ['fine art', 'painting', 'classical', 'traditional', 'masterpiece', 'oil painting'],
      'semi-realistic': ['semi-realistic', 'stylized', 'soft', 'semi realism'],
      'realistic': ['realistic', 'photorealistic', 'detailed', 'hyperrealistic', 'lifelike', 'photograph'],
      'anime': ['anime', 'animé', 'japanese', 'manga style', 'cel shading'],
      'cartoon': ['cartoon', 'comic', 'comic book', 'caricature', 'whimsical'],
      'manga': ['manga', 'manga style', 'line art', 'ink'],
      'acg': ['acg', 'character', 'illustration', 'digital art'],
      'wuxia': ['wuxia', 'martial arts', 'chinese art', 'asian', 'fantasy']
    };

    this.attributeKeywords = {
      'anatomy': ['anatomy', 'anatomical', 'body', 'anatomy', 'proportions', 'figure'],
      'objects': ['object', 'objects', 'items', 'detail', 'weapon', 'clothing', 'outfit', 'armor'],
      'coloring': ['color', 'colour', 'coloring', 'coloration', 'palette', 'hue', 'shading', 'vibrant', 'saturation'],
      'background': ['background', 'environment', 'scene', 'landscape', 'setting', 'scenery'],
      'expression': ['expression', 'emotion', 'face', 'expression', 'dynamic', 'pose', 'action'],
      'lighting': ['lighting', 'light', 'shadow', 'contrast', 'illumination', 'glow']
    };

    this.intensityKeywords = {
      'weak': ['subtle', 'light', 'slight', 'gentle', 'soft', 'minimal'],
      'medium': ['moderate', 'balanced', 'normal', 'typical'],
      'strong': ['strong', 'heavy', 'dramatic', 'bold', 'intense', 'very'],
      'very-strong': ['very strong', 'extremely', 'very', 'intense', 'heavily']
    };
  }

  /**
   * Parse user input to extract artist preferences
   * @param {string} input - Natural language user description
   * @returns {object} Parsed preferences
   */
  parseUserInput(input) {
    const lowercaseInput = input.toLowerCase();

    return {
      detectedStyles: this.extractStyles(lowercaseInput),
      detectedAttributes: this.extractAttributes(lowercaseInput),
      styleIntensity: this.extractIntensity(lowercaseInput),
      excludedKeywords: this.extractExclusions(lowercaseInput),
      preferenceScore: this.calculatePreferenceScore(lowercaseInput),
      rawInput: input
    };
  }

  /**
   * Extract art styles mentioned in user input
   * @param {string} input - Lowercase input string
   * @returns {array} Array of detected styles with confidence
   */
  extractStyles(input) {
    const detectedStyles = [];

    Object.entries(this.artStyleKeywords).forEach(([style, keywords]) => {
      keywords.forEach(keyword => {
        if (input.includes(keyword)) {
          const existing = detectedStyles.find(s => s.style === style);
          if (existing) {
            existing.count += 1;
          } else {
            detectedStyles.push({ style, count: 1, confidence: 0.8 });
          }
        }
      });
    });

    // Sort by count (frequency) and confidence
    return detectedStyles
      .sort((a, b) => b.count - a.count)
      .map(s => ({
        ...s,
        confidence: Math.min(0.8 + (s.count * 0.05), 1.0)
      }));
  }

  /**
   * Extract specific attributes the user cares about
   * @param {string} input - Lowercase input string
   * @returns {object} Extracted attributes with importance scores
   */
  extractAttributes(input) {
    const attributes = {};

    Object.entries(this.attributeKeywords).forEach(([attr, keywords]) => {
      let count = 0;
      keywords.forEach(keyword => {
        if (input.includes(keyword)) {
          count += 1;
        }
      });

      if (count > 0) {
        attributes[attr] = {
          importance: Math.min(0.5 + (count * 0.2), 1.0),
          mentioned: true
        };
      }
    });

    return attributes;
  }

  /**
   * Extract user's desired intensity level for artist effect
   * @param {string} input - Lowercase input string
   * @returns {object} Intensity information
   */
  extractIntensity(input) {
    let intensity = 'medium';
    let confidence = 0.5;

    // Check for strong indicators
    if (this.intensityKeywords['very-strong'].some(kw => input.includes(kw))) {
      intensity = 'very-strong';
      confidence = 0.9;
    } else if (this.intensityKeywords['strong'].some(kw => input.includes(kw))) {
      intensity = 'strong';
      confidence = 0.8;
    } else if (this.intensityKeywords['weak'].some(kw => input.includes(kw))) {
      intensity = 'weak';
      confidence = 0.8;
    } else if (this.intensityKeywords['medium'].some(kw => input.includes(kw))) {
      intensity = 'medium';
      confidence = 0.7;
    }

    return { intensity, confidence };
  }

  /**
   * Extract excluded keywords/artists
   * @param {string} input - Lowercase input string
   * @returns {array} List of excluded items
   */
  extractExclusions(input) {
    const exclusions = [];
    const excludePatterns = [
      /not\s+(\w+)/g,
      /without\s+(\w+)/g,
      /avoid\s+(\w+)/g,
      /no\s+(\w+)/g
    ];

    excludePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        if (match[1]) {
          exclusions.push(match[1]);
        }
      }
    });

    return exclusions;
  }

  /**
   * Calculate an overall preference score based on how specific the input is
   * @param {string} input - Lowercase input string
   * @returns {number} Score 0-1
   */
  calculatePreferenceScore(input) {
    const wordCount = input.split(/\s+/).length;
    const hasStyles = Object.values(this.artStyleKeywords).some(keywords =>
      keywords.some(kw => input.includes(kw))
    );
    const hasAttributes = Object.values(this.attributeKeywords).some(keywords =>
      keywords.some(kw => input.includes(kw))
    );

    let score = 0;
    score += wordCount > 5 ? 0.3 : 0.1; // Longer input = more thought
    score += hasStyles ? 0.35 : 0; // Style focus
    score += hasAttributes ? 0.35 : 0; // Attribute focus

    return Math.min(score, 1.0);
  }

  /**
   * Get suggested keywords for missing information
   * @param {object} parsed - Parsed input from parseUserInput
   * @returns {array} Array of suggested keywords or attributes to clarify
   */
  getSuggestedKeywords(parsed) {
    const suggestions = [];

    if (parsed.detectedStyles.length === 0) {
      suggestions.push('Consider specifying an art style (e.g., anime, realistic, cartoon)');
    }

    if (Object.keys(parsed.detectedAttributes).length === 0) {
      suggestions.push('You could mention specific attributes (e.g., good at anatomy, vibrant colors)');
    }

    if (parsed.styleIntensity.confidence < 0.6) {
      suggestions.push('Feel free to specify how strong you want the effect (subtle, strong, etc.)');
    }

    return suggestions;
  }
}

module.exports = NLPParsingService;
