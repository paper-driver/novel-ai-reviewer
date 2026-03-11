const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Paths for data and generated image storage
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reviews.json');
const GENERATED_DIR = path.join(__dirname, 'generated');

// Ensure required directories exist
if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR);
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

// Helper to read reviews from the JSON file
function readReviews() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Failed to read reviews file:', err);
    return [];
  }
}

// Helper to write reviews to the JSON file
function writeReviews(reviews) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(reviews, null, 2));
}

// Configure Multer storage. For each new review we create a new folder named numerically
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine the folder based on the next review ID
    const reviews = readReviews();
    const nextId = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    const folderPath = path.join(GENERATED_DIR, String(nextId));
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
    // Save folder name on request object so we can use it later
    req.generatedFolder = String(nextId);
    cb(null, folderPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

/**
 * POST /api/reviews
 * Accepts multipart/form-data including review details and images.
 * Creates a new review entry and stores images under a numeric folder.
 */
app.post('/api/reviews', upload.array('images'), (req, res) => {
  try {
    const { prompt, review, ratings } = req.body;
    if (!prompt || !ratings || !req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Missing required fields or images' });
    }
    const parsedRatings = JSON.parse(ratings);
    const reviews = readReviews();
    const id = reviews.length > 0 ? Math.max(...reviews.map(r => r.id)) + 1 : 1;
    const folderName = req.generatedFolder || String(id);
    const images = req.files.map(f => f.filename);
    const thumbnail = images[0];
    const newReview = {
      id,
      prompt,
      review,
      ratings: parsedRatings,
      folder: folderName,
      images,
      thumbnail
    };
    reviews.push(newReview);
    writeReviews(reviews);
    res.json(newReview);
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

/**
 * GET /api/reviews
 * Returns list of reviews. Supports filtering via query params.
 */
app.get('/api/reviews', (req, res) => {
  try {
    let reviews = readReviews();
    const { prompt, handFeet, facialExpression, genital, accessories, sideCharacter, background } = req.query;
    if (prompt) {
      const lower = String(prompt).toLowerCase();
      reviews = reviews.filter(r => r.prompt.toLowerCase().includes(lower));
    }
    const filters = { handFeet, facialExpression, genital, accessories, sideCharacter, background };
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        reviews = reviews.filter(r => r.ratings[key] === value);
      }
    });
    res.json(reviews);
  } catch (err) {
    console.error('Error reading reviews:', err);
    res.status(500).json({ error: 'Failed to retrieve reviews' });
  }
});

/**
 * GET /api/reviews/:id/images
 * Returns list of image filenames for a given review.
 */
app.get('/api/reviews/:id/images', (req, res) => {
    const { id } = req.params;
    const reviews = readReviews();
    const review = reviews.find(r => String(r.id) === String(id));
    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }
    res.json(review.images);
});

/**
 * Serves an image from the generated folder
 */
app.get('/api/images/:folder/:file', (req, res) => {
  const { folder, file } = req.params;
  const filePath = path.join(GENERATED_DIR, folder, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  res.sendFile(filePath);
});

/**
 * PUT /api/reviews/:id
 * Updates an existing review. Images are optional - if new images are provided,
 * they replace the old ones.
 */
app.put('/api/reviews/:id', upload.array('images'), (req, res) => {
  try {
    const { id } = req.params;
    const { prompt, review, ratings, existingImages } = req.body;
    
    if (!prompt || !ratings) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const reviews = readReviews();
    const reviewIndex = reviews.findIndex(r => r.id === parseInt(id));
    
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const parsedRatings = JSON.parse(ratings);
    const existingReview = reviews[reviewIndex];
    
    // Parse existing images (which ones to keep)
    let imagesToKeep = existingReview.images;
    if (existingImages) {
      try {
        imagesToKeep = JSON.parse(existingImages);
      } catch (e) {
        // If parse fails, keep all existing images
        imagesToKeep = existingReview.images;
      }
    }
    
    // Remove images that are no longer in the keep list
    const folderPath = path.join(GENERATED_DIR, existingReview.folder);
    existingReview.images.forEach(img => {
      if (!imagesToKeep.includes(img)) {
        const filePath = path.join(folderPath, img);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
    
    // Combine kept existing images with newly uploaded images
    let finalImages = [...imagesToKeep];
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => f.filename);
      finalImages = [...imagesToKeep, ...newImages];
    }
    
    // Set thumbnail to first image in final list
    let thumbnail = finalImages.length > 0 ? finalImages[0] : existingReview.thumbnail;

    const updatedReview = {
      ...existingReview,
      prompt,
      review,
      ratings: parsedRatings,
      images: finalImages,
      thumbnail
    };

    reviews[reviewIndex] = updatedReview;
    writeReviews(reviews);
    res.json(updatedReview);
  } catch (err) {
    console.error('Error updating review:', err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

/**
 * DELETE /api/reviews/:id
 * Deletes a review and its associated images.
 */
app.delete('/api/reviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const reviews = readReviews();
    const reviewIndex = reviews.findIndex(r => r.id === parseInt(id));
    
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviews[reviewIndex];
    
    // Delete the folder and its images
    const folderPath = path.join(GENERATED_DIR, review.folder);
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    }

    // Remove from reviews array
    reviews.splice(reviewIndex, 1);
    writeReviews(reviews);
    
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

app.listen(PORT, () => {
  console.log(`Review server listening on port ${PORT}`);
});