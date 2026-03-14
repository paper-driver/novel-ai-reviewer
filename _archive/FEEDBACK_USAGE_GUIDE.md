# Quick Start: Using the Feedback System

Now that your feedback file is cleaned up, here's how to use the AI feedback feature:

## 📝 How to Submit Feedback

### Step 1: Open an Image
- Open the app and navigate to your folder
- Click on any image to view it

### Step 2: Get AI Rating
- Click the "AI Rate" button to get automatic scoring
- The AI will analyze and give you:
  - Overall Score (1-10)
  - Component scores:
    - Anatomy
    - Pose
    - Face Quality
    - Background Quality
    - Object Quality
    - Coherence

### Step 3: Disagree? Submit Feedback!
- If you think the score is wrong, click "Correct the AI"
- A modal will appear asking:
  - What score do you give it? (1-10)
  - Why do you disagree? (optional reasoning)
  - Break down by component (optional)

### Step 4: Feedback Saved!
- Your feedback is automatically saved
- Next time you analyze that same image, the AI will use your scores

---

## 💡 How the AI Learns

### Example
You have an image that the AI rates as **6/10 overall**, but you think it's **8/10**.

**What happens:**
1. You submit: User Score = 8, AI Score = 6
2. The system calculates: **Correction = +2** (user rated 2 points higher)
3. Your component scores (anatomy, pose, etc.) are saved

**Next time you analyze that image:**
- Instead of AI scores, your user scores are used
- The overall score is recalculated using your component feedback
- Result: The image now shows your corrected score

### Building Preferences Over Time
With multiple feedback entries:
- The system sees patterns in your preferences
- Example: If you consistently rate images with detailed hands higher, the AI learns this
- Future images with good hand anatomy will be rated higher
- The `/api/feedback/analysis` endpoint shows your correction patterns

---

## 📊 Where is My Feedback Stored?

**Location:** 
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/.ai-feedback.json
```

**Format:**
```json
{
  "imageId": "filename.png",
  "aiScore": 6,
  "userScore": 8,
  "correction": 2,
  "components": {
    "anatomy": 7,
    "pose": 6,
    "face": 8,
    "background": 5,
    "objects": 7,
    "coherence": 8
  },
  "timestamp": "2026-03-13T12:30:45.123Z"
}
```

---

## 🔍 Checking Your Feedback

### Via the App
- Go to the feedback analysis section (if available)
- See your correction patterns and AI bias

### Via Command Line
```bash
# View all feedback
cd /Volumes/WD_BLACK/private/NovelAI/SortByArtist
cat .ai-feedback.json | python3 -m json.tool

# Count total entries
cat .ai-feedback.json | grep -c "imageId"

# See average corrections
python3 << 'EOF'
import json
with open('.ai-feedback.json') as f:
    data = json.load(f)
corrections = [e['correction'] for e in data['entries']]
print(f"Average correction: {sum(corrections)/len(corrections):.1f}")
print(f"Total entries: {len(corrections)}")
EOF
```

---

## ⚠️ Important Notes

### Feedback Only Works on Exact Filenames
- Feedback is matched by exact filename
- If a file is renamed, the feedback won't apply
- If a file is deleted and replaced with a new version (different seed), the old feedback won't apply

### Feedback is Per-Source Folder
- Each folder has its own `.ai-feedback.json` file
- Feedback in `/Volumes/.../SortByArtist/` only applies to images in that folder
- If you copy images to another folder, the feedback doesn't copy with it

### Backup Your Feedback
- Original backup: `.ai-feedback.json.backup.1773440406754`
- Consider backing up periodically:
  ```bash
  cp .ai-feedback.json .ai-feedback.json.backup.$(date +%s)
  ```

---

## 🚀 Tips for Best Results

### 1. **Be Consistent**
- Use the same criteria for rating
- If you value detailed anatomy, rate anatomy-heavy images higher
- The AI will learn your consistent preferences

### 2. **Provide Reasoning**
- Include why you disagree with the AI
- This helps with future analysis
- Example: "Face quality is actually better than the eyes suggest"

### 3. **Rate Component Scores**
- Breaking down by component is more powerful than just overall score
- Example: anatomy 8, face 7 tells more than overall 7
- The AI uses component patterns to improve

### 4. **Multiple Corrections**
- The more feedback you provide, the better the AI learns
- Try to give feedback for 5-10 images
- The system needs patterns to identify your preferences

### 5. **Different Image Types**
- Try to feedback on different image types
- Anime, realistic, different poses, different clothing
- This helps the AI generalize your preferences

---

## 🛠️ Troubleshooting

### "Feedback submitted but not applying"
**Possible causes:**
1. Server restarted - feedback might not be loaded yet
2. Image filename changed - filenames must match exactly
3. Different source folder - feedback only works in same folder

**Solution:**
- Restart the app
- Check that filename hasn't changed
- Make sure you're analyzing images from the same folder

### "Want to reset feedback"
**To start completely fresh:**
```bash
cd /Volumes/WD_BLACK/private/NovelAI/SortByArtist
rm .ai-feedback.json
# Create new empty file:
echo '{"entries":[]}' > .ai-feedback.json
```

### "Lost old feedback"
**Original backup location:**
```
.ai-feedback.json.backup.1773440406754
```

To restore:
```bash
cp .ai-feedback.json.backup.1773440406754 .ai-feedback.json
```

---

## 📈 Understanding Feedback Analysis

The system can analyze patterns in your feedback:

```
GET /api/feedback/analysis?sourcePath=/Volumes/.../SortByArtist
```

Returns:
```json
{
  "overallBias": {
    "description": "AI scores too low",
    "amount": 1.2,
    "recommendation": "AI tends to rate 1.2 points lower than you"
  },
  "componentPatterns": {
    "anatomy": {
      "avgScore": 7.2,
      "pattern": "User rewards high anatomy scores"
    },
    "face": {
      "avgScore": 6.8,
      "pattern": "User penalizes high face quality"
    }
  }
}
```

---

## Next Steps

1. **Open the app** and navigate to your image folder
2. **Rate a few images** using the AI feedback feature
3. **Provide corrections** for images you think the AI got wrong
4. **Check the feedback file** to see your entries being stored
5. **Re-analyze images** to see your corrections applied

Your feedback is now being used! Start training the AI with your preferences! 🎯
