#!/bin/bash

# Test the feedback system with sourcePath parameter

SOURCE_PATH="/Volumes/WD_BLACK/private/NovelAI/SortByArtist"

echo "Testing Feedback Submission with sourcePath..."
echo "================================================"

# Test 1: Submit feedback with sourcePath
echo -e "\n1. Submitting feedback with sourcePath parameter..."
curl -X POST http://localhost:3000/api/feedback/submit \
  -H "Content-Type: application/json" \
  -d "{
    \"imageId\": \"test-image.png\",
    \"aiScore\": 7,
    \"userScore\": 8,
    \"correction\": 1,
    \"reasoning\": \"Face quality was better than AI rated\",
    \"components\": {
      \"anatomy\": 8,
      \"pose\": 7,
      \"face\": 9,
      \"background\": 6,
      \"objects\": 7,
      \"coherence\": 8
    },
    \"sourcePath\": \"$SOURCE_PATH\"
  }" | jq .

# Test 2: Get feedback list with sourcePath
echo -e "\n\n2. Getting feedback list with sourcePath parameter..."
curl -X GET "http://localhost:3000/api/feedback/list?sourcePath=$SOURCE_PATH" \
  -H "Content-Type: application/json" | jq '.entries | length'

echo -e "\n\n3. Checking the actual file..."
if [ -f "$SOURCE_PATH/.ai-feedback.json" ]; then
  echo "File exists at: $SOURCE_PATH/.ai-feedback.json"
  echo "Total entries: $(jq '.entries | length' "$SOURCE_PATH/.ai-feedback.json")"
  echo "Last 2 entries:"
  jq '.entries[-2:]' "$SOURCE_PATH/.ai-feedback.json"
else
  echo "File not found at expected location"
fi

echo -e "\n================================================"
echo "Test complete!"
