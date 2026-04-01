const NLPParsingService = require('./nlpParsingService');

/**
 * Combination Generator Service
 * Generates optimized artist combinations based on user input and registry data
 */
class CombinationGeneratorService {
  constructor() {
    this.nlpParser = new NLPParsingService();
    this.savedCombinations = []; // Could be persisted to file
  }

  /**
   * Generate artist combinations from user input
   * @param {array} registryArtists - Artist records from registry
   * @param {string} userInput - Natural language user request
   * @param {number} maxSuggestions - Max number of combinations to generate
   * @returns {object} Generated combinations with rankings
   */
  generateCombinations(registryArtists, userInput, maxSuggestions = 5) {
    try {
      // Parse user input
      const parsed = this.nlpParser.parseUserInput(userInput);

      // Find matching artists
      const matchedArtists = this.findMatchingArtists(registryArtists, parsed);

      if (matchedArtists.length === 0) {
        return {
          success: false,
          message: 'No matching artists found for your description',
          suggestions: this.nlpParser.getSuggestedKeywords(parsed)
        };
      }

      // Generate combination suggestions
      const combinations = this.generateCombinationSuggestions(
        matchedArtists,
        parsed,
        maxSuggestions
      );

      // Rank combinations
      const rankedCombinations = this.rankCombinations(combinations, parsed);

      return {
        success: true,
        input: userInput,
        parsed,
        suggestions: rankedCombinations.slice(0, maxSuggestions),
        matchedArtists: matchedArtists.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error generating combinations:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Find artists that match the user's parsed input
   * @param {array} registryArtists - All artists
   * @param {object} parsed - Parsed user input
   * @returns {array} Matched artists with scores
   */
  findMatchingArtists(registryArtists, parsed) {
    const matched = [];

    registryArtists.forEach(artist => {
      let matchScore = 0;

      // Match on art style
      if (parsed.detectedStyles.length > 0) {
        const styleMatch = parsed.detectedStyles.find(s => s.style === artist.artStyle);
        if (styleMatch) {
          matchScore += styleMatch.confidence * 0.5;
        }
      }

      // Match on attributes
      let attributeMatches = 0;
      Object.entries(parsed.detectedAttributes).forEach(([attr, _]) => {
        // Check if artist's scores suggest this attribute
        if (attr === 'anatomy' && artist.anatomy >= 5) attributeMatches++;
        if (attr === 'objects' && artist.object >= 5) attributeMatches++;
        if (attr === 'coloring' && artist.colouring >= 5) attributeMatches++;
        if (attr === 'background' && artist.anatomy >= 5) attributeMatches++; // Proxy
        if (attr === 'expression' && artist.promptInterpretation >= 5) attributeMatches++;
      });

      if (attributeMatches > 0) {
        matchScore += (attributeMatches / Object.keys(parsed.detectedAttributes).length) * 0.5;
      }

      // Boost if artist has good strength
      if (artist.strength > 0.7) {
        matchScore *= 1.1;
      }

      if (matchScore > 0) {
        matched.push({
          ...artist,
          matchScore: Math.min(matchScore, 1.0),
          matchedAttributes: attributeMatches
        });
      }
    });

    // Sort by match score
    return matched.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Generate combination suggestions from matched artists
   * @param {array} matchedArtists - Artists that match user input
   * @param {object} parsed - Parsed user input
   * @param {number} maxSuggestions - Max combinations to generate
   * @returns {array} Generated combinations
   */
  generateCombinationSuggestions(matchedArtists, parsed, maxSuggestions) {
    const combinations = [];

    // Strategy 1: Top artist as primary with complementary artists
    if (matchedArtists.length > 0) {
      const primary = matchedArtists[0];
      const complementary = this.findComplementaryArtists(primary, matchedArtists.slice(1));

      if (complementary.length > 0) {
        const combo = {
          artists: [
            {
              artist: primary,
              role: 'primary',
              emphasis: this.calculateEmphasis(primary, parsed, 'primary')
            },
            ...complementary.slice(0, 2).map(comp => ({
              artist: comp,
              role: 'complementary',
              emphasis: this.calculateEmphasis(comp, parsed, 'secondary')
            }))
          ]
        };
        combinations.push(combo);
      }
    }

    // Strategy 2: Multiple equally-weighted artists
    if (matchedArtists.length >= 2) {
      const topArtists = matchedArtists.slice(0, 3);
      const combo = {
        artists: topArtists.map(artist => ({
          artist,
          role: 'balanced',
          emphasis: this.calculateEmphasis(artist, parsed, 'balanced')
        }))
      };
      combinations.push(combo);
    }

    // Strategy 3: Attributes-focused combinations
    const attributeFocusedCombos = this.generateAttributeFocusedCombos(
      matchedArtists,
      parsed
    );
    combinations.push(...attributeFocusedCombos.slice(0, maxSuggestions - combinations.length));

    return combinations.slice(0, maxSuggestions);
  }

  /**
   * Find artists that complement each other
   * @param {object} primaryArtist - Main artist
   * @param {array} candidates - Potential complementary artists
   * @returns {array} Sorted complementary artists
   */
  findComplementaryArtists(primaryArtist, candidates) {
    return candidates.map(artist => {
      let complementScore = 0;

      // Different art style = more complementary
      if (artist.artStyle !== primaryArtist.artStyle) {
        complementScore += 0.3;
      }

      // Complementary attributes
      if (primaryArtist.anatomy < 5 && artist.anatomy >= 7) complementScore += 0.2;
      if (primaryArtist.colouring < 5 && artist.colouring >= 7) complementScore += 0.2;
      if (primaryArtist.promptInterpretation < 5 && artist.promptInterpretation >= 7) {
        complementScore += 0.2;
      }

      // Strong artists are good complements
      if (artist.strength > 0.7) complementScore += 0.1;

      return {
        ...artist,
        complementScore
      };
    }).sort((a, b) => b.complementScore - a.complementScore);
  }

  /**
   * Calculate emphasis weight for an artist in a combination
   * Formula: base_user_preference × strength_adjustment_factor
   * @param {object} artist - Artist record
   * @param {object} parsed - Parsed user input
   * @param {string} role - 'primary', 'secondary', or 'balanced'
   * @returns {number} Emphasis weight (typically 0.5-2.0)
   */
  calculateEmphasis(artist, parsed, role) {
    // Base preference (role-dependent)
    let basePreference;
    switch (role) {
      case 'primary':
        basePreference = 1.5; // Strong emphasis for primary
        break;
      case 'secondary':
        basePreference = 1.0; // Moderate for secondary
        break;
      case 'balanced':
        basePreference = 1.1; // Slight boost for balanced
        break;
      default:
        basePreference = 1.0;
    }

    // Adjust based on intensity requested
    const intensityMultiplier = {
      'weak': 0.7,
      'medium': 1.0,
      'strong': 1.2,
      'very-strong': 1.4
    };
    basePreference *= intensityMultiplier[parsed.styleIntensity.intensity] || 1.0;

    // Strength-based adjustment factor
    let strengthAdjustment;
    if (artist.strengthLabel === 'weak') {
      strengthAdjustment = 1.5; // Boost weak artists
    } else if (artist.strengthLabel === 'medium') {
      strengthAdjustment = 1.0; // Keep medium at baseline
    } else if (artist.strengthLabel === 'strong') {
      strengthAdjustment = 0.8; // Reduce strong artists to balance
    } else {
      strengthAdjustment = 1.0;
    }

    // Final emphasis
    const emphasis = basePreference * strengthAdjustment;

    // Clamp to typical Novel AI range (0.5-2.0)
    return Math.max(0.5, Math.min(2.0, parseFloat(emphasis.toFixed(2))));
  }

  /**
   * Generate attribute-focused combinations
   * @param {array} matchedArtists - Matched artists
   * @param {object} parsed - Parsed input
   * @returns {array} Attribute-focused combinations
   */
  generateAttributeFocusedCombos(matchedArtists, parsed) {
    const combos = [];
    const attributes = Object.keys(parsed.detectedAttributes);

    // Group artists by strength in each attribute
    attributes.forEach(attr => {
      const groupedByAttr = this.groupArtistsByAttribute(matchedArtists, attr);

      if (groupedByAttr.strong.length > 0 && groupedByAttr.weak.length > 0) {
        const combo = {
          artists: [
            ...groupedByAttr.strong.slice(0, 1).map(a => ({
              artist: a,
              role: 'primary',
              emphasis: this.calculateEmphasis(a, parsed, 'primary')
            })),
            ...groupedByAttr.weak.slice(0, 1).map(a => ({
              artist: a,
              role: 'complementary',
              emphasis: this.calculateEmphasis(a, parsed, 'secondary')
            }))
          ],
          focusAttribute: attr
        };
        combos.push(combo);
      }
    });

    return combos;
  }

  /**
   * Group artists by their strength in a specific attribute
   * @param {array} artists - Artists to group
   * @param {string} attribute - Attribute name
   * @returns {object} Artists grouped by strength
   */
  groupArtistsByAttribute(artists, attribute) {
    const scoreMap = {
      'anatomy': a => a.anatomy,
      'objects': a => a.object,
      'coloring': a => a.colouring,
      'expression': a => a.promptInterpretation,
      'background': a => (a.anatomy + a.object) / 2 // Proxy
    };

    const score = scoreMap[attribute] || (() => 5);

    return {
      strong: artists.filter(a => score(a) >= 7),
      medium: artists.filter(a => score(a) >= 5 && score(a) < 7),
      weak: artists.filter(a => score(a) < 5)
    };
  }

  /**
   * Rank combinations by quality and relevance
   * @param {array} combinations - Combinations to rank
   * @param {object} parsed - Parsed user input
   * @returns {array} Ranked combinations with scores
   */
  rankCombinations(combinations, parsed) {
    return combinations.map(combo => {
      let rankScore = 0;

      // Score based on number of artists (more variety = better)
      rankScore += Math.min(combo.artists.length * 0.1, 0.3);

      // Score based on match quality
      const avgMatchScore = combo.artists.reduce((sum, a) => sum + (a.artist.matchScore || 0.5), 0) /
                           combo.artists.length;
      rankScore += avgMatchScore * 0.4;

      // Score based on artist strength
      const avgStrength = combo.artists.reduce((sum, a) => sum + a.artist.strength, 0) /
                         combo.artists.length;
      rankScore += avgStrength * 0.2;

      // Score based on complementarity (if roles differ)
      const hasVariedRoles = new Set(combo.artists.map(a => a.role)).size > 1;
      if (hasVariedRoles) {
        rankScore += 0.1;
      }

      // Generate human-readable explanation
      const explanation = this.generateExplanation(combo, parsed);

      return {
        ...combo,
        rankScore: Math.min(rankScore, 1.0),
        confidence: Math.round((0.7 + rankScore * 0.3) * 100) + '%',
        explanation
      };
    }).sort((a, b) => b.rankScore - a.rankScore);
  }

  /**
   * Generate human-readable explanation for a combination
   * @param {object} combo - Combination
   * @param {object} parsed - Parsed user input
   * @returns {string} Explanation
   */
  generateExplanation(combo, parsed) {
    const roles = {};
    combo.artists.forEach(a => {
      if (!roles[a.role]) roles[a.role] = [];
      roles[a.role].push(a.artist.name);
    });

    let explanation = '';

    if (roles['primary']) {
      explanation += `${roles['primary'][0]} provides the primary style. `;
    }

    if (roles['complementary']) {
      explanation += `${roles['complementary'].join(', ')} add complementary strengths. `;
    }

    if (roles['balanced']) {
      explanation += `Combined balance of ${roles['balanced'].join(', ')}. `;
    }

    explanation += `This matches your interest in ${parsed.detectedStyles.map(s => s.style).join(', ') || 'these styles'}.`;

    return explanation;
  }

  /**
   * Format combination for Novel AI prompt
   * @param {object} combo - Combination with artists and emphasis
   * @returns {string} Formatted prompt string
   */
  formatPrompt(combo) {
    return combo.artists
      .map(a => `${a.emphasis}::artist:${a.artist.name}::`)
      .join(', ');
  }

  /**
   * Save a combination for future reference
   * @param {object} combo - Combination to save
   * @param {string} name - Custom name for combination
   * @returns {object} Saved combination
   */
  saveCombination(combo, name) {
    const saved = {
      id: `combo_${Date.now()}`,
      name,
      artists: combo.artists.map(a => ({
        name: a.artist.name,
        emphasis: a.emphasis
      })),
      createdAt: new Date().toISOString(),
      promptFormat: this.formatPrompt(combo)
    };

    this.savedCombinations.push(saved);
    return saved;
  }

  /**
   * Get saved combinations
   * @returns {array} All saved combinations
   */
  getSavedCombinations() {
    return this.savedCombinations;
  }
}

module.exports = CombinationGeneratorService;
