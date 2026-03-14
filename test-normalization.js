// Test script to verify rating key normalization

function normalizeRatingKeys(ratings) {
  const normalized = {};
  for (const [key, value] of Object.entries(ratings)) {
    const basenameMatch = key.match(/(s-\d+\.png)$/i);
    if (basenameMatch) {
      const basename = basenameMatch[1];
      if (!normalized[basename]) {
        normalized[basename] = value;
      }
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Test 1: Old format with full prompts
console.log('=== Test 1: Old format ===');
const oldFormat = {
  '1girl, blue eyes s-227156113.png': 8,
  'anime girl s-2698445372.png': 6,
  'prompt s-1910090355.png': 7
};
const norm1 = normalizeRatingKeys(oldFormat);
console.log('Before:', Object.keys(oldFormat).length, 'keys');
console.log('After:', Object.keys(norm1).length, 'keys');
console.log('Result:', norm1);

// Test 2: Already normalized
console.log('\n=== Test 2: New format ===');
const newFormat = {
  's-227156113.png': 8,
  's-2698445372.png': 6
};
const norm2 = normalizeRatingKeys(newFormat);
console.log('Keys preserved:', Object.keys(newFormat).length === Object.keys(norm2).length);
console.log('Result:', norm2);

console.log('\n✅ Tests completed');
