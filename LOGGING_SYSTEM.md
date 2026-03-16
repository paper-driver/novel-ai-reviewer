# Logging System with Log Levels

## Overview

A log level system has been added to `server.js` to control verbosity. You can now filter console output by importance level.

## Log Levels (from least to most verbose)

| Level | Value | Usage | Show |
|-------|-------|-------|------|
| **ERROR** | 0 | Critical errors, failures | ❌ Errors only |
| **WARN** | 1 | Warnings, recoverable issues | ⚠️ Errors + Warnings |
| **INFO** | 2 | Important events, state changes | ℹ️ **DEFAULT** |
| **DEBUG** | 3 | Detailed debugging info | 🔍 All except traces |
| **TRACE** | 4 | Very detailed execution flow | 📝 Everything |

## How to Use

### Set Log Level

Use the `LOG_LEVEL` environment variable when starting the server:

```bash
# Error level only
LOG_LEVEL=ERROR npm start

# Warnings and errors
LOG_LEVEL=WARN npm start

# Info level (DEFAULT)
LOG_LEVEL=INFO npm start

# Debug mode - detailed logging
LOG_LEVEL=DEBUG npm start

# Trace mode - everything
LOG_LEVEL=TRACE npm start
```

### Direct Commands

```bash
# Production - only errors
LOG_LEVEL=ERROR /Users/leonmao/.nvm/versions/node/v22.22.1/bin/node server.js

# Development - debug info
LOG_LEVEL=DEBUG /Users/leonmao/.nvm/versions/node/v22.22.1/bin/node server.js
```

## Logger API

```javascript
// Import already done in server.js
// Use logger anywhere in the code:

logger.error('TagName', 'Error message', optionalData);
logger.warn('TagName', 'Warning message', optionalData);
logger.info('TagName', 'Info message', optionalData);
logger.debug('TagName', 'Debug message', optionalData);
logger.trace('TagName', 'Trace message', optionalData);
```

### Examples

```javascript
// ML Pattern Learning
logger.debug('ML', `Learning patterns from ${totalEntries} feedback entries`);
logger.trace('ML', `${component}: avg=${pattern.avg}, confidence=${pattern.confidence}`);

// Feedback System
logger.info('Feedback', `Saved ${feedbackData.entries.length} entries`);
logger.warn('Feedback', `Failed to load feedback: ${err.message}`);

// Image Analysis
logger.debug('Illustration', `Using ILLUSTRATION weights`);
logger.trace('Illustration', `Component scores: Anatomy=${anatomyScore}...`);

// Batch Processing
logger.debug('BatchRating', `Applied learned patterns`);
logger.warn('BatchRating', `Max retries exceeded, using fallback`);
```

## Log Output Examples

### INFO Level (Default)
```
[Feedback] INFO: Saved 76 feedback entries
[Illustration] INFO: Analysis complete: 6/10
```

### DEBUG Level
```
[Feedback] INFO: Saved 76 feedback entries
[ML] DEBUG: Learning patterns from 76 feedback entries
[ML] DEBUG: Calculated patterns for 6 components
[Illustration] DEBUG: Pre-feedback scores calculated
[Illustration] DEBUG: Using ILLUSTRATION weights
[Illustration] INFO: Analysis complete: 6/10
```

### TRACE Level (Very Verbose)
```
[All DEBUG messages PLUS:]
[ML] TRACE: anatomy: avg=6.37, count=76, confidence=0.78
[ML] TRACE: pose: avg=6.05, count=76, confidence=0.94
[Illustration] TRACE: Component scores: Anatomy=6, Pose=6, Face=6...
[Illustration] TRACE: Applying component correction
```

## Recommended Levels by Use Case

| Use Case | Level | Reason |
|----------|-------|--------|
| **Production** | `ERROR` | Only show failures |
| **Normal use** | `INFO` | See important events |
| **Troubleshooting** | `DEBUG` | Detailed debugging info |
| **Development** | `DEBUG` or `TRACE` | Full visibility into logic |
| **ML debugging** | `DEBUG` | See pattern calculations |

## Currently Instrumented Modules

The following modules have been updated with logger calls:

- ✅ **ML Pattern Learning** - DEBUG/TRACE for pattern calculations
- ✅ **Feedback System** - INFO/WARN/ERROR for feedback operations
- ⏳ **Illustration Analysis** - Partial (old console.log still present)
- ⏳ **Batch Rating** - Partial (old console.log still present)

## Gradual Migration

For now, both `console.log` and `logger.*` are used in the codebase. Over time, all can be replaced with the logger system. The existing `console.log` statements are not harmful, just less organized.

## To Complete Migration

To replace all remaining `console.log` with logger calls:

```bash
# This would systematically replace all console.log in server.js
sed -i 's/console\.log(\(`.*\)`)/logger.info("Tag", \1)/g' server.js
```

However, this requires careful tagging of each log with the appropriate level and tag name.

## Testing the Logger

```bash
# Terminal 1: Start server in DEBUG mode
LOG_LEVEL=DEBUG npm start

# Terminal 2: Analyze an image
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H 'Content-Type: application/json' \
  -d '{"filePath": "/path/to/image.png", "sourcePath": "/path/to/source"}'

# You'll see DEBUG level logs in Terminal 1 output
```

## Performance Impact

Negligible - the logging system only evaluates and prints statements that match the current log level. Disabled log levels have virtually no performance overhead.

## Future Improvements

Could add:
- File logging
- Timestamp formatting
- JSON logging for structured analysis
- Log rotation
- Different log levels per module
