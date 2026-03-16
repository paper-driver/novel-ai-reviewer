# Logging Quick Reference

## Start Server with Specific Log Level

```bash
# Default (INFO) - Production-like
node server.js

# Development (DEBUG)
LOG_LEVEL=DEBUG node server.js

# Very Verbose (TRACE)
LOG_LEVEL=TRACE node server.js

# Production (WARN only)
LOG_LEVEL=WARN node server.js

# Minimal (ERROR only)
LOG_LEVEL=ERROR node server.js
```

## Logger Usage

```javascript
logger.error('Tag', 'message');  // Critical failures
logger.warn('Tag', 'message');   // Warnings/recoverable errors
logger.info('Tag', 'message');   // Important events
logger.debug('Tag', 'message');  // Detailed info
logger.trace('Tag', 'message');  // Very detailed info
```

## Common Log Tags

- `Illustration` - Image rating analysis
- `BatchRating` - Batch processing
- `ML` - Machine learning patterns
- `Feedback` - User feedback
- `Grouping` - Artist grouping
- `ArtistGallery` - Gallery operations
- `FolderPicker` - File picker
- `Copy` - File operations
- `Metadata` - Image metadata
- `Reviews` - Review management

## What Each Level Shows

| Level | Shows | Use Case |
|-------|-------|----------|
| ERROR | Only critical failures | Production minimum |
| WARN | Errors + warnings | Production default |
| INFO | Errors + warnings + events | Default/normal |
| DEBUG | + detailed debugging info | Development |
| TRACE | + every calculation step | Deep debugging |

## Testing a Single Endpoint

```bash
# Start with DEBUG logs
LOG_LEVEL=DEBUG node server.js

# In another terminal:
curl -X POST http://localhost:3000/api/analyze-illustration \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/image.png"}'
```

Watch the DEBUG and INFO level logs for detailed output!
