# Artist Gallery Search Feature

## Overview
The Artist Gallery now includes a powerful search feature that allows users to search for artist tag combinations. The search is designed to be intuitive and preserve the exact structure and ordering of artist tags, including special characters like `{}` and `[]`.

## Features

### Search Functionality
- **Case-Insensitive Matching**: Search terms are matched case-insensitively, so you can search for "artist" and it will match "Artist"
- **Substring Matching**: The search looks for exact substring matches in artist tag combinations
- **Order Preservation**: The search respects the order of artists as they appear in the display (separated by `|`)
- **Special Character Support**: Special characters like `{}`, `[]`, and other formatting symbols are fully supported and respected in searches

### Examples

#### Example 1: Simple Artist Search
- **Artist Tags**: `artist1 | artist2 | artist3`
- **Search**: `artist2`
- **Result**: ✓ Matches

#### Example 2: Exact Order Matters
- **Artist Tags**: `laserf flip | butcha-u | cor369`
- **Search**: `butcha-u | cor369`
- **Result**: ✓ Matches (exact substring)
- **Search**: `cor369 | butcha-u`
- **Result**: ✗ Does NOT match (order is different)

#### Example 3: Special Characters Supported
- **Artist Tags**: `{artist: sohn} | [artist:hero]`
- **Search**: `{artist: sohn}`
- **Result**: ✓ Matches (preserves brackets and colons)

#### Example 4: Partial Matches
- **Artist Tags**: `laserf flip | butcha-u | cor369`
- **Search**: `laserf`
- **Result**: ✓ Matches (partial match in first artist)

#### Example 5: Case Insensitivity
- **Artist Tags**: `LaserfFlip | ButchaU`
- **Search**: `laserflip`
- **Result**: ✓ Matches (case-insensitive)

## UI Components

### Search Input Panel
Located above the gallery table, the search panel includes:

1. **Search Input Field**
   - Placeholder text: "Search artist tags (preserves order and special characters like {}, [])"
   - Real-time filtering as you type
   - Clear button (✕) appears when search text is entered

2. **Clear Button**
   - Appears automatically when you enter search text
   - Click to reset search and show all groups

3. **Result Counter**
   - The gallery header shows filtered results: "X / Y groups"
   - Example: "12 / 45 groups" means 12 matches out of 45 total groups

4. **Empty State Message**
   - When search returns no results, displays helpful message
   - Suggests adjusting the search query

## Implementation Details

### Files Modified
- `artist-gallery.component.ts`: Added search logic and state management
- `artist-gallery.component.html`: Added search UI and result counter
- `artist-gallery.component.scss`: Added search panel styling

### Key Methods

#### `applySearch()`
```typescript
// Filters groups based on search text
// Real-time matching with case-insensitive substring search
// Preserves special characters and order
applySearch(): void
```

#### `clearSearch()`
```typescript
// Resets search and shows all groups
clearSearch(): void
```

### Component State
- `searchText: string`: Stores current search input
- `filteredGroups: ArtistGroupInfo[]`: Stores filtered results
- `groups: ArtistGroupInfo[]`: Stores all original groups

## How to Use

1. **Load Artist Groups**
   - Select a sorted folder
   - Click "Load Artist Groups"

2. **Search for Artist Tags**
   - Once groups are loaded, you'll see the search panel
   - Type your search query in the search input
   - Results filter in real-time as you type

3. **Examples of Searches**
   - `laserf` - Find all groups containing "laserf"
   - `butcha-u | cor369` - Find exact combination
   - `{artist:` - Find all groups with this format
   - `[artist:` - Find all groups with square bracket format

4. **Clear Search**
   - Click the ✕ button to clear and see all groups again

## Technical Notes

### Search Behavior
- **Non-Breaking**: Search does not modify underlying data
- **Case-Insensitive**: All matching is done after converting to lowercase
- **Substring-Based**: Searches for the query as a substring in artist display
- **Order-Sensitive**: The order of artist tags matters for matching

### Performance
- Real-time filtering with instant visual feedback
- Efficient substring matching on filtered results
- No server-side processing required

### Browser Compatibility
- Works in all modern browsers
- Fully integrated with Angular 19 reactive forms

## Future Enhancements (Optional)
- Multi-term search with AND/OR logic (like prompt grouping)
- Exclusion filters with `-` prefix
- Regular expression search support
- Search result highlighting
- Advanced filtering options (image count, date range, etc.)

## Related Features
- **Bulk Filtering**: You can combine search with other gallery features
- **Image Viewer**: Click thumbnails to view full images for matching groups
- **Folder Navigation**: Use "Open in Finder" to explore matched groups
