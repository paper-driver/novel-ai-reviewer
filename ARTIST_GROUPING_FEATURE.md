# Artist Grouping Feature - Implementation Summary

## Overview
A comprehensive feature that groups images by artist tags extracted from their metadata, with support for custom source and destination folders.

## Key Features

### 1. Flexible Folder Selection
- **Source Folder**: User can specify ANY folder on their system (not limited to `generated/`)
- **Destination Folder**: User can choose where to store the sorted subfolders
- Uses prompt dialogs for folder path input (required due to browser filesystem restrictions)

### 2. Smart Artist Tag Extraction
- Normalizes artist tags regardless of bracket/brace formatting
- Handles formats like:
  - `{artist: name}`
  - `[artist:name]`
  - `artist:name`
  - `{{{artist:name}}}`
  - Any combination with multiple brackets/braces
- **Order-independent**: Artists are extracted and sorted alphabetically for consistent grouping
- **Bracket-insensitive**: The number and type of brackets don't affect grouping

### 3. Automatic Organization
- Creates numbered subfolders (1, 2, 3, etc.) for each unique artist combination
- Copies PNG files from source to appropriate subfolders
- Generates detailed grouping report with:
  - Total images processed
  - Number of groups created
  - Unique artists found
  - Complete metadata for each image

## User Interface

### Artist Grouping Tab
Located in the main application navbar, provides:
- **Source Folder Selector**: Click button to enter folder path
- **Destination Folder Selector**: Click button to enter where to store sorted images
- **Group Button**: Starts the grouping process
- **Results Display**: Shows:
  - Summary statistics
  - Artist groups table with image counts
  - Complete metadata list

### Visual Feedback
- Selected folders display with green highlight and checkmark
- Real-time path display
- Loading state with progress message
- Error messages with detailed information
- Success summary with action confirmation

## Backend Implementation

### Endpoints

#### 1. `/api/group-by-artists/:folder`
Original endpoint for grouping within `generated/` folder structure.

#### 2. `/api/group-by-artists-path` (NEW)
Accepts custom source and destination paths:
```json
{
  "sourcePath": "/full/path/to/images",
  "destinationPath": "/full/path/to/sorted"
}
```

### Artist Extraction Algorithm
```javascript
// Normalized extraction that handles all bracket formats
function extractArtistTags(prompt) {
  // Pattern matches: {artist: name}, [artist:name], artist:name, etc.
  // Removes all brackets/braces and normalizes
  // Returns sorted array for consistent grouping
}
```

**Key behaviors**:
1. Extracts artist names using flexible regex pattern
2. Removes all bracket/brace characters
3. Returns sorted array (alphabetical order)
4. Ensures images with same artists group together regardless of:
   - Order in prompt
   - Number/type of brackets
   - Spacing/formatting

### Response Format
```json
{
  "success": true,
  "sourceFolder": "/path/to/source",
  "totalImages": 50,
  "groupCount": 5,
  "groups": {
    "1": {
      "artistKey": "artist1 | artist2",
      "artists": ["artist1", "artist2"],
      "count": 10,
      "images": ["image1.png", "image2.png", ...]
    }
  },
  "imageMetadata": [
    {
      "filename": "image1.png",
      "artists": ["artist1", "artist2"],
      "artistKey": "artist1 | artist2"
    }
  ]
}
```

## File Structure
```
generated/
  source-folder/
    image1.png
    image2.png
    ...

destination-folder/
  1/
    image1.png (artist1, artist2)
  2/
    image3.png (artist3, artist4)
  3/
    image5.png (no artists)
```

## Integration Points

### Service Layer (`review.service.ts`)
- `groupImagesByArtists(folder)`: Original endpoint
- `groupImagesByArtistsWithPath(sourcePath, destPath)`: New flexible endpoint

### Component (`artist-grouping.component.ts`)
- `selectSourceFolder()`: Prompt for source path
- `selectDestinationFolder()`: Prompt for destination path
- `groupByArtists()`: Execute grouping operation

### UI Navigation
- Added to main `app.component.html` as a tab
- Accessible via "Artist Grouping Tool" button in header
- Separate from main review interface

## Error Handling
- Validates folder paths exist
- Checks for PNG files in source
- Gracefully handles file read/write errors
- Reports detailed error messages to user
- Continues processing even if individual files fail

## Performance Considerations
- PNG metadata reading is done in-memory
- File copying uses `fs.copyFileSync` for reliability
- Suitable for folders with hundreds to thousands of images
- No file size limitations (PNG metadata parsed efficiently)

## Use Cases
1. **Organize generated images by artist style**: Group all images created with specific artists together
2. **Portfolio organization**: Sort images by creative style combination
3. **Quality control**: Identify which artist combinations produce preferred results
4. **Archival**: Organize images for long-term storage by aesthetic attributes

## Example Workflow
1. User clicks "Artist Grouping Tool" tab
2. Selects source folder: `/Users/name/Downloads/generated_images/`
3. Selects destination: `/Users/name/Pictures/sorted_by_artist/`
4. Clicks "Start Grouping"
5. Application extracts artists from all PNG metadata
6. Creates subfolders 1, 2, 3, etc. based on unique artist combinations
7. Copies images to appropriate folders
8. Displays report showing 5 groups created from 42 images with 12 unique artists

## Technical Dependencies
- Express.js (backend routing)
- Node.js fs module (file operations)
- PNG metadata reading (custom implementation)
- Angular (frontend framework)
- TypeScript (type safety)
