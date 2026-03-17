const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG',
  4: 'TRACE'
};

let currentLevel = LEVELS.INFO;

const logger = {
  setLevel(level) {
    if (typeof level === 'string') {
      currentLevel = LEVELS[level] || LEVELS.INFO;
    } else {
      currentLevel = level;
    }
  },

  error(context, message) {
    if (currentLevel >= LEVELS.ERROR) {
      console.error(`[${context}] ERROR: ${message}`);
    }
  },

  warn(context, message) {
    if (currentLevel >= LEVELS.WARN) {
      console.warn(`[${context}] WARN: ${message}`);
    }
  },

  info(context, message) {
    if (currentLevel >= LEVELS.INFO) {
      console.log(`[${context}] INFO: ${message}`);
    }
  },

  debug(context, message) {
    if (currentLevel >= LEVELS.DEBUG) {
      console.log(`[${context}] DEBUG: ${message}`);
    }
  },

  trace(context, message) {
    if (currentLevel >= LEVELS.TRACE) {
      console.log(`[${context}] TRACE: ${message}`);
    }
  }
};

module.exports = logger;
