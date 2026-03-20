const express = require('express');

function createBatchRatingRoutes(batchRatingService) {
  const router = express.Router();

  router.post('/submit', async (req, res) => {
    try {
      const { folderPath, imageFilenames, sourcePath } = req.body;
      const result = batchRatingService.submitBatchJob(folderPath, imageFilenames, sourcePath);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/status/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;
      const status = batchRatingService.getJobStatus(jobId);
      res.json(status);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.get('/jobs', (req, res) => {
    try {
      const jobs = batchRatingService.getAllJobs();
      res.json(jobs);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/results/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;
      const results = batchRatingService.getJobResults(jobId);
      res.json(results);
    } catch (err) {
      if (err.message === 'Job not found') {
        return res.status(404).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/cancel/:jobId', (req, res) => {
    try {
      const { jobId } = req.params;
      const result = batchRatingService.cancelBatchJob(jobId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createBatchRatingRoutes;
