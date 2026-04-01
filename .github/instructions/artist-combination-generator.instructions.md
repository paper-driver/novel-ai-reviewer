# Artist Combination Generator Instructions
## Overall Goal:
Help users generate artist combinations based on their natural language input and artist registry data. The generator will use the artist registry to find artists that match the user's input and suggest combinations of artists that can be used in Novel AI image generation. Emphasis weights (strengthening/weakening vectors) are calculated based on each artist's measured strength from the Artist Registry.

## Features:
- User can input natural language descriptions of the type of artists they want to combine (e.g. "I want to combine an artist who is good at anatomy with an artist who has a fine art style").
- The generator will parse the user's input and identify the desired attributes (e.g. "good at anatomy", "fine art style").
- The generator will query the artist registry to find artists that match the identified attributes and suggest combinations of artists that meet the user's criteria.
- The generator will provide a ranked list of artist combinations based on how well they match the user's input, their measured strength values from the registry, and how well they complement each other.
- The generator will allow users to save their favorite artist combinations for easy reference in the future.
- The generator will continuously update its suggestions based on new data added to the artist registry, ensuring that users always have access to the most relevant and effective artist combinations for their image generation needs.  
- The generator will also provide explanations for why certain artist combinations are suggested, based on the attributes, measured strengths, and complementary characteristics of the artists in the registry. This will help users understand the rationale behind the suggestions and make informed decisions when selecting artist combinations for their image generation.
- The generator will be designed to be user-friendly and accessible, allowing users of all levels of experience with Novel AI to easily find and use effective artist combinations for their image generation projects.
- The generator will provide artist combinations formatted with strengthening/weakening vectors based on:
  1. The artist's measured strength value from the registry (auto-calculated via hybrid Google Vision API + LPIPS)
  2. User preference intensity for that artist style/attributes
  3. Artist's subjective quality metrics (anatomy, coloring, etc.)
- Emphasis calculation formula:
  ```
  emphasis_weight = base_user_preference × strength_adjustment_factor
  
  where:
    base_user_preference = 1.0-2.0 (how much user wants this style)
    strength_adjustment_factor = {
      weak (0-0.33): 1.4-1.6 (boost weak artists to be effective),
      medium (0.34-0.66): 1.0 (keep proportional),
      strong (0.67-1.0): 0.7-0.9 (strong artists need less boost)
    }
  ```
  This ensures weak artists get fair emphasis while strong artists don't overshadow other elements.
  
- The generator will allow users to input specific artists they want to include or exclude from the combinations, giving them more control over the suggestions and allowing for more personalized artist combinations based on their preferences and needs.
- The generator will be designed to be easily integrated into the Novel AI interface, allowing users to seamlessly access and use the artist combination suggestions while working on their image generation projects.
- The generator will generate artist combinations in Novel AI prompt format like:
  ```
  0.9::artist:greg_rutkowski::, 1.1::artist:wlop::, 0.8::artist:loish::
  ```
  allowing users to easily copy-paste combinations directly into Novel AI prompts with optimal emphasis weights.

## Complementary Characteristics:
When suggesting combinations, the generator should consider:
- **Art Style Variety**: Don't combine multiple artists with identical styles (avoid redundancy)
- **Attribute Balance**: Combine artists with different strengths (one good at anatomy, another at coloring)
- **Strength Levels**: Mix weak, medium, and strong artists appropriately for desired effect
- **Multi-Style Appeal**: For example: anime style (wlop) + realistic detail (greg_rutkowski) = hybrid look

## Output Format Example:
```
Suggested Combination for: "Anime style with realistic anatomy and detailed background"

Rank 1 - Confidence: 92%
├─ 1.1::artist:wlop:: (primary anime style, strength: strong)
├─ 0.85::artist:greg_rutkowski:: (realistic anatomy support, strength: strong)
├─ 0.9::artist:loish:: (color and detail, strength: medium)
└─ Explanation: wlop provides strong anime aesthetic, greg_rutkowski brings realistic anatomical grounding, loish adds color depth

Full Prompt Format:
1.1::artist:wlop::, 0.85::artist:greg_rutkowski::, 0.9::artist:loish::

Rank 2 - Confidence: 87%
├─ 1.0::artist:cutesexyrobots:: (anime-realistic fusion, strength: medium)
└─ 0.95::artist:rossdraws:: (character design and anatomy, strength: strong)

Full Prompt Format:
1.0::artist:cutesexyrobots::, 0.95::artist:rossdraws::
```