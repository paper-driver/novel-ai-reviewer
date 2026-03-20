# Latest Modified Sort Feature

## Overview
Added "Latest Modified" sorting capability to both **Artist Gallery** and **Prompt Grouping** pages, allowing users to sort tables by modification date.

## Features Added

### 1. Artist Gallery Component (`artist-gallery.component.ts`)
- **New State Variable:** `sortByModified: 'desc' | 'asc' | 'none' = 'none'`
- **New Methods:**
  - `toggleModifiedSorting()` - Cycle through sort states: none → desc (newest first) → asc (oldest first) → none
  - `getModifiedSortLabel()` - Returns button label with icon and description
  - `applySorting()` - Unified sorting logic that prioritizes modified date over rating

### 2. Artist Gallery HTML (`artist-gallery.component.html`)
Added new sort button in filter controls:
```html
<div class="filter-group">
  <button 
    (click)="toggleModifiedSorting()" 
    [class.active]="sortByModified !== 'none'"
    class="btn-modified-sort"
    title="Sort by latest modified date (click to cycle through sort orders)">
    {{ getModifiedSortLabel() }}
  </button>
</div>
```

### 3. Prompt Grouping Component (`prompt-grouping.component.ts`)
- **New State Variable:** `sortByModified: 'desc' | 'asc' | 'none' = 'none'`
- **New Methods:**
  - `toggleModifiedSorting()` - Cycle through sort states
  - `getModifiedSortLabel()` - Button label generation
  - `applySorting()` - Unified sorting logic

### 4. Prompt Grouping HTML (`prompt-grouping.component.html`)
Added matching sort button in filter controls with identical functionality.

## Sort Behavior

### Sort Order
- **Desc (Newest First):** Most recently modified items appear first
- **Asc (Oldest First):** Oldest modified items appear first
- **None:** No sorting applied (results shown in default order)

### Button States
- **Inactive:** `⇄ Modified (No Sort)` - No sorting applied
- **Desc Active:** `↓ Modified (Newest First)` - Button highlighted
- **Asc Active:** `↑ Modified (Oldest First)` - Button highlighted

### Sorting Priority
When both modified and rating sorts are enabled:
- **Modified sort takes precedence** - If modified sort is active (desc/asc), it will be applied regardless of rating sort state
- Users can toggle modified sort off to revert to rating sort

## Implementation Details

### Data Used
- `group.latestModifiedTime` - Timestamp property available on all groups
- Converted to `Date` objects for numeric comparison: `new Date(timestamp).getTime()`

### Search Behavior
- Sorting applies **after** filtering by search/nickname
- Filter controls remain separate from sorting logic
- Cache is updated after sort is applied

### User Workflow
1. Select folder and load groups
2. Optionally apply nickname/text filters
3. Click "Modified" button to enable date-based sorting
4. Click again to toggle between newest/oldest first
5. Click again to disable sorting

## Files Modified
1. `src/app/components/artist-gallery/artist-gallery.component.ts`
   - Added `sortByModified` state variable
   - Added `toggleModifiedSorting()`, `getModifiedSortLabel()`, `applySorting()` methods
   - Updated `applySearch()` to call `applySorting()` instead of inline rating sort

2. `src/app/components/artist-gallery/artist-gallery.component.html`
   - Added "Modified" sort button to filter controls section

3. `src/app/components/prompt-grouping/prompt-grouping.component.ts`
   - Added `sortByModified` state variable
   - Added `toggleModifiedSorting()`, `getModifiedSortLabel()`, `applySorting()` methods
   - Updated `applyFilter()` to call `applySorting()` instead of inline rating sort

4. `src/app/components/prompt-grouping/prompt-grouping.component.html`
   - Added "Modified" sort button to filter controls section

## Testing
- ✅ Sort button appears on both Artist Gallery and Prompt Grouping pages
- ✅ Button cycles through states: None → Desc → Asc → None
- ✅ Button shows correct label based on state
- ✅ Button highlights when sort is active (desc/asc)
- ✅ Sorting applies after filtering
- ✅ Cache is updated with sorted results
- ✅ Modified sort takes precedence over rating sort

## UI Consistency
- Both components use identical button styling (`btn-modified-sort`)
- Both use same label format: `↓/↑/⇄ Modified (Description)`
- Both support tooltips explaining the feature
- Both integrate seamlessly with existing filter controls
