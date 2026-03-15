# AI Corrections Widget Feature

## Overview
A collapsible widget that displays analytics about how much you're correcting the AI's ratings based on your feedback. This widget appears at the top of the main app window and can be expanded/collapsed as needed.

## Features

### Main Statistics
- **Total Corrections**: Total number of feedback entries recorded
- **Average Correction**: Average difference between user rating and AI rating (positive = user rated higher, negative = rated lower)
- **Upgraded Count**: Number of times user rated images higher than AI suggested
- **Downgraded Count**: Number of times user rated images lower than AI suggested

### Component Breakdown
Detailed view of corrections by component:
- Anatomy
- Pose
- Face
- Background
- Objects
- Coherence

For each component, shows:
- Number of corrections
- Average correction value
- Min/max correction range

### Display Features
- **Collapsible Design**: Click header to expand/collapse the widget
- **Auto-Refresh**: Updates every 30 seconds automatically
- **Manual Refresh**: Click refresh button to update immediately
- **Color Coding**:
  - Green: Positive corrections (upgraded ratings)
  - Red: Negative corrections (downgraded ratings)
  - Orange: Neutral (no significant change)
- **Source Tracking**: Shows which source folder statistics are from

## Technical Details

### Frontend Component
- **Location**: `src/app/components/ai-corrections-widget/`
- **Files**:
  - `ai-corrections-widget.component.ts` - Component logic
  - `ai-corrections-widget.component.html` - Template
  - `ai-corrections-widget.component.scss` - Styling
- **Dependencies**: Angular HttpClient, RxJS

### Backend Endpoint
- **Endpoint**: `GET /api/feedback/stats`
- **Query Parameters**: 
  - `sourcePath` (optional) - specific folder to get stats for
- **Response**:
  ```json
  {
    "success": boolean,
    "stats": {
      "totalCorrections": number,
      "averageCorrection": number,
      "positiveCorrections": number,
      "negativeCorrections": number,
      "byComponent": {
        "componentName": {
          "count": number,
          "averageCorrection": number,
          "min": number,
          "max": number
        }
      },
      "sourceFolder": string
    }
  }
  ```

## How It Works

1. **Widget Initialization**: When the app loads, the widget automatically loads statistics from the current source folder
2. **Auto-Refresh**: Every 30 seconds, the widget refreshes to show latest feedback data
3. **User Interaction**: 
   - Click header to expand/collapse
   - Click refresh button to manually update
4. **Statistics Calculation**:
   - Analyzes all feedback entries in `.ai-feedback.json`
   - Calculates average differences between user and AI ratings
   - Groups corrections by component for detailed analysis

## Integration

The widget is integrated into the main app (`app.component.ts` and `app.component.html`) and appears at the top of the page, above the navigation tabs.

## Styling

The widget uses:
- **Color Scheme**: Purple/blue gradient header with white content
- **Responsive Design**: Adapts to mobile and desktop screens
- **Animations**: Smooth expand/collapse transitions
- **Hover Effects**: Interactive stat cards with elevation changes

## Future Enhancements

Possible improvements:
- Export statistics to CSV/JSON
- Time-based filtering (last 7 days, last month, etc.)
- Component-specific feedback filtering
- Comparison between different source folders
- Visualization charts (bar charts, trend lines)
- Feedback source breakdown (by user, by component, etc.)
