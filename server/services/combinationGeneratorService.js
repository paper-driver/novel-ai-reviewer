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
            ...complementary.slice(0, 5).map(comp => ({
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
      const topArtists = matchedArtists.slice(0, 6);
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

    // Strategy 4: Variations with different artist subsets (to fill remaining slots)
    if (combinations.length < maxSuggestions && matchedArtists.length >= 3) {
      const remainingSlots = maxSuggestions - combinations.length;
      const subsetCombos = this.generateSubsetCombinations(
        matchedArtists,
        parsed,
        remainingSlots,
        combinations
      );
      combinations.push(...subsetCombos);
    }

    return combinations.slice(0, maxSuggestions);
  }

  /**
   * Generate combinations from different artist subsets
   * @param {array} matchedArtists - All matched artists
   * @param {object} parsed - Parsed user input
   * @param {number} count - Number of combinations to generate
   * @param {array} existingCombos - Existing combinations to avoid duplicates
   * @returns {array} Subset combinations
   */
  generateSubsetCombinations(matchedArtists, parsed, count, existingCombos = []) {
    const combos = [];
    const maxComboSize = 5;

    // Create variations with different artist combinations
    for (let i = 0; i < count && combos.length < count; i++) {
      const startIdx = i % Math.max(1, matchedArtists.length - 2);
      const comboSize = 2 + (i % (maxComboSize - 1)); // Vary size from 2-5
      const selectedArtists = matchedArtists.slice(startIdx, startIdx + comboSize);

      if (selectedArtists.length > 0) {
        let artists = selectedArtists.map((artist, idx) => ({
          artist,
          role: idx === 0 ? 'primary' : idx === selectedArtists.length - 1 ? 'accent' : 'complementary',
          emphasis: this.calculateEmphasis(artist, parsed, idx === 0 ? 'primary' : 'secondary')
        }));

        // Normalize emphasis to prevent any artist from dominating
        artists = this.normalizeEmphasis(artists);

        const combo = { artists };
        
        // Avoid duplicates
        const existing = existingCombos.some(c => 
          c.artists.length === combo.artists.length &&
          c.artists.every((a, idx) => a.artist.name === combo.artists[idx].artist.name)
        );
        
        if (!existing) {
          combos.push(combo);
        }
      }
    }

    return combos;
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
        basePreference = 1.3; // Strong emphasis for primary
        break;
      case 'secondary':
        basePreference = 0.9; // Moderate for secondary
        break;
      case 'complementary':
        basePreference = 0.85; // Slightly lower for complementary
        break;
      case 'accent':
        basePreference = 0.8; // Lower for accent
        break;
      case 'balanced':
        basePreference = 1.0; // Neutral for balanced
        break;
      default:
        basePreference = 1.0;
    }

    // Adjust based on intensity requested
    const intensityMultiplier = {
      'weak': 0.85,
      'medium': 1.0,
      'strong': 1.15,
      'very-strong': 1.25
    };
    basePreference *= intensityMultiplier[parsed.styleIntensity.intensity] || 1.0;

    // Calculate attribute-based adjustment factor
    // Normalize each attribute to 0-1 scale (0-10 score)
    const attributeScores = {
      anatomy: (artist.anatomy || 5) / 10,
      objects: (artist.object || 5) / 10,
      coloring: (artist.colouring || 5) / 10,
      expression: (artist.promptInterpretation || 5) / 10
    };

    // Calculate average attribute score
    const avgAttributeScore = Object.values(attributeScores).reduce((a, b) => a + b, 0) / 4;

    // Bonus/penalty based on attributes
    // If artist excels at attributes mentioned in user request, boost them
    let attributeBonus = 1.0;
    const requestedAttrs = Object.keys(parsed.detectedAttributes);
    
    if (requestedAttrs.length > 0) {
      const attrMap = {
        'anatomy': attributeScores.anatomy,
        'objects': attributeScores.objects,
        'coloring': attributeScores.coloring,
        'background': Math.min(attributeScores.anatomy, attributeScores.objects),
        'expression': attributeScores.expression
      };

      // Calculate how well this artist matches requested attributes
      const matchedAttrScores = requestedAttrs.map(attr => attrMap[attr] || 0.5);
      const attrMatchScore = matchedAttrScores.reduce((a, b) => a + b, 0) / matchedAttrScores.length;
      
      // Bonus ranges from 0.9 (if weak on requested attrs) to 1.2 (if strong on requested attrs)
      attributeBonus = 0.9 + (attrMatchScore * 0.3);
    }

    // Strength-based adjustment (more conservative to prevent dominance)
    let strengthAdjustment;
    if (artist.strengthLabel === 'weak') {
      strengthAdjustment = 1.2; // Boost weak artists slightly
    } else if (artist.strengthLabel === 'medium') {
      strengthAdjustment = 1.0; // Keep medium at baseline
    } else if (artist.strengthLabel === 'strong') {
      strengthAdjustment = 0.9; // Reduce strong artists more moderately
    } else {
      strengthAdjustment = 1.0;
    }

    // Final emphasis with attribute consideration
    const emphasis = basePreference * strengthAdjustment * attributeBonus;

    // Clamp to narrower Novel AI range to prevent dominance (0.7-1.6 instead of 0.5-2.0)
    return Math.max(0.7, Math.min(1.6, parseFloat(emphasis.toFixed(2))));
  }

  /**
   * Normalize emphasis values in a combination to prevent any artist from dominating
   * @param {array} artists - Artists in combination
   * @returns {array} Artists with normalized emphasis values
   */
  normalizeEmphasis(artists) {
    if (artists.length <= 1) return artists;

    const emphases = artists.map(a => a.emphasis);
    const minEmphasis = Math.min(...emphases);
    const maxEmphasis = Math.max(...emphases);
    const range = maxEmphasis - minEmphasis;

    // If all emphases are very similar, no normalization needed
    if (range < 0.1) return artists;

    // Redistribute emphasis in a narrower range (0.8-1.3) to maintain hierarchy but prevent dominance
    return artists.map(artist => {
      const normalized = range > 0 
        ? 0.8 + ((artist.emphasis - minEmphasis) / range) * 0.5
        : 1.0;
      return {
        ...artist,
        emphasis: parseFloat(normalized.toFixed(2)),
        originalEmphasis: artist.emphasis // Keep original for reference
      };
    });
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
