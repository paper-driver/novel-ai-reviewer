const WebSocket = require('ws');
const logger = require('../utils/logger');

const TAG = 'WebSocketService';

/**
 * WebSocket Service
 * Manages real-time communication with connected clients
 */
class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Set();

    this.wss.on('connection', (ws) => {
      logger.info(TAG, 'Client connected');
      this.clients.add(ws);

      // Remove client when disconnected
      ws.on('close', () => {
        logger.info(TAG, 'Client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error(TAG, `WebSocket error: ${error.message}`);
        this.clients.delete(ws);
      });
    });

    logger.info(TAG, 'WebSocket server initialized');
  }

  /**
   * Broadcast validation complete event to all connected clients
   * @param {string} artistId - Artist ID
   * @param {string} artistName - Artist name
   * @param {object} analysisResult - Analysis results with scores
   */
  broadcastValidationComplete(artistId, artistName, analysisResult) {
    const event = {
      type: 'validation-complete',
      artistId,
      artistName,
      analysisResult,
      timestamp: new Date().toISOString()
    };

    logger.info(TAG, `Broadcasting validation complete for artist: ${artistName}`);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(event));
        } catch (error) {
          logger.error(TAG, `Error sending message: ${error.message}`);
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * Broadcast analysis started event
   * @param {string} artistId - Artist ID
   * @param {string} artistName - Artist name
   * @param {string} jobId - Job ID
   */
  broadcastAnalysisStarted(artistId, artistName, jobId) {
    const event = {
      type: 'analysis-started',
      artistId,
      artistName,
      jobId,
      timestamp: new Date().toISOString()
    };

    logger.info(TAG, `Broadcasting analysis started for artist: ${artistName} (job: ${jobId})`);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(event));
        } catch (error) {
          logger.error(TAG, `Error sending message: ${error.message}`);
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * Broadcast error event
   * @param {string} artistId - Artist ID
   * @param {string} message - Error message
   */
  broadcastError(artistId, message) {
    const event = {
      type: 'analysis-error',
      artistId,
      message,
      timestamp: new Date().toISOString()
    };

    logger.error(TAG, `Broadcasting error for artist ${artistId}: ${message}`);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(event));
        } catch (error) {
          logger.error(TAG, `Error sending message: ${error.message}`);
          this.clients.delete(client);
        }
      }
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
}

module.exports = WebSocketService;
