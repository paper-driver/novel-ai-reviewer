const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * LPIPS Service
 * Node.js wrapper for Python-based LPIPS (Learned Perceptual Image Patch Similarity) computation
 * Spawns and manages a Python subprocess for efficient image similarity analysis
 */
class LpipsService {
  constructor() {
    this.pythonProcess = null;
    this.isReady = false;
    this.requestQueue = [];
    this.initializePythonProcess();
  }

  /**
   * Initialize and start the Python subprocess
   */
  initializePythonProcess() {
    try {
      const mlDir = path.join(__dirname, '..', 'ml');
      const scriptPath = path.join(mlDir, 'lpips_analyzer.py');

      // Check if Python script exists, if not create a fallback
      if (!fs.existsSync(scriptPath)) {
        console.warn('LPIPS Python script not found, using fallback strategy');
        this.useFallbackMode = true;
        this.isReady = true;
        return;
      }

      // Spawn Python process
      this.pythonProcess = spawn('python3', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle Python process output
      this.pythonProcess.stdout.on('data', (data) => {
        this.handlePythonOutput(data.toString());
      });

      this.pythonProcess.stderr.on('data', (data) => {
        console.error('LPIPS Python error:', data.toString());
      });

      this.pythonProcess.on('close', (code) => {
        this.isReady = false;
      });

      this.pythonProcess.on('error', (error) => {
        console.error('Failed to spawn LPIPS Python process:', error);
        this.useFallbackMode = true;
        this.isReady = true;
      });

      // Mark ready after process is spawned
      this.isReady = true;
    } catch (error) {
      console.error('Error initializing LPIPS service:', error);
      this.useFallbackMode = true;
      this.isReady = true;
    }
  }

  /**
   * Compute LPIPS distance between two images
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @returns {Promise<number>} LPIPS distance (0-1, where 0 = identical, 1 = very different)
   */
  async computeDistance(imagePath_A, imagePath_B) {
    return new Promise((resolve, reject) => {
      try {
        // Validate image paths
        if (!fs.existsSync(imagePath_A) || !fs.existsSync(imagePath_B)) {
          reject(new Error('One or more image files do not exist'));
          return;
        }

        // Use fallback if Python process not available
        if (this.useFallbackMode) {
          resolve(this.fallbackComputeDistance(imagePath_A, imagePath_B));
          return;
        }

        // Send request to Python process
        const request = {
          id: Math.random().toString(36).substr(2, 9),
          imageA: imagePath_A,
          imageB: imagePath_B,
          resolve,
          reject
        };

        if (!this.pythonProcess || !this.isReady) {
          this.requestQueue.push(request);
          return;
        }

        this.sendToPythonProcess(request);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send request to Python process
   * @param {object} request - Request object with id, imageA, imageB, resolve, reject
   */
  sendToPythonProcess(request) {
    try {
      const message = JSON.stringify({
        id: request.id,
        imageA: request.imageA,
        imageB: request.imageB
      }) + '\n';

      this.pythonProcess.stdin.write(message, 'utf-8', (error) => {
        if (error) {
          request.reject(error);
        }
      });

      // Store request for response handling
      if (!this.pendingRequests) {
        this.pendingRequests = {};
      }
      this.pendingRequests[request.id] = request;
    } catch (error) {
      request.reject(error);
    }
  }

  /**
   * Handle Python process output
   * @param {string} data - Output data from Python process
   */
  handlePythonOutput(data) {
    try {
      const lines = data.trim().split('\n');
      
      lines.forEach(line => {
        if (line.length === 0) return;

        const response = JSON.parse(line);
        
        if (!response.id || !this.pendingRequests || !this.pendingRequests[response.id]) {
          console.warn('Received response for unknown request:', response.id);
          return;
        }

        const request = this.pendingRequests[response.id];
        delete this.pendingRequests[response.id];

        if (response.error) {
          request.reject(new Error(response.error));
        } else {
          request.resolve(response.distance);
        }
      });

      // Process queued requests if available
      if (this.requestQueue.length > 0 && this.isReady) {
        const nextRequest = this.requestQueue.shift();
        this.sendToPythonProcess(nextRequest);
      }
    } catch (error) {
      console.error('Error parsing Python output:', error);
    }
  }

  /**
   * Fallback LPIPS computation (approximation when Python is unavailable)
   * Uses simple image difference metrics as placeholder
   * @param {string} imagePath_A - Path to first image
   * @param {string} imagePath_B - Path to second image
   * @returns {number} Approximate LPIPS score
   */
  fallbackComputeDistance(imagePath_A, imagePath_B) {
    try {
      // Get file sizes as rough proxy for image difference
      const statA = fs.statSync(imagePath_A);
      const statB = fs.statSync(imagePath_B);

      const sizeA = statA.size;
      const sizeB = statB.size;

      // Simple approximation: larger size difference = more different images
      const maxSize = Math.max(sizeA, sizeB);
      const minSize = Math.min(sizeA, sizeB);
      
      if (maxSize === 0) return 0.5;
      
      const sizeDifference = (maxSize - minSize) / maxSize;
      
      // Return rough approximation (0.3-0.7 range as typical difference)
      return Math.min(0.3 + (sizeDifference * 0.4), 0.9);
    } catch (error) {
      console.error('Error in fallback LPIPS computation:', error);
      return 0.5; // Return neutral value on error
    }
  }

  /**
   * Gracefully shutdown the LPIPS service
   */
  async shutdown() {
    return new Promise((resolve) => {
      try {
        if (this.pythonProcess && this.pythonProcess.stdin) {
          this.pythonProcess.stdin.write(JSON.stringify({ id: 'shutdown' }) + '\n');
        }

        if (this.pythonProcess) {
          // Give process time to cleanup
          setTimeout(() => {
            if (this.pythonProcess) {
              this.pythonProcess.kill();
            }
            this.isReady = false;
            resolve();
          }, 1000);
        } else {
          resolve();
        }
      } catch (error) {
        console.error('Error shutting down LPIPS service:', error);
        resolve();
      }
    });
  }

  /**
   * Check if LPIPS service is ready
   * @returns {boolean} Service ready status
   */
  isServiceReady() {
    return this.isReady;
  }
}

module.exports = LpipsService;
