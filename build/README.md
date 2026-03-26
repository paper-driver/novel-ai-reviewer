# App Icons

This directory contains the app icons for the Novel AI Reviewer desktop application.

## Required Icons

The following icon files are needed for building desktop packages:

### macOS
- `icon.icns` - App icon for macOS (512x512)
- Required for `.dmg` and `.zip` installers

### Windows  
- `icon.ico` - App icon for Windows (256x256, supports multiple resolutions)
- Required for `.exe` installer

### Linux
- `icon.png` - App icon for Linux (512x512 PNG format)
- Required for `.AppImage` package

## Creating Icons

### Option 1: Use electron-icon-builder (Recommended)
```bash
npm install --save-dev electron-icon-builder
# Place a 512x512 PNG at build/icon.png
npm run electron-icon-builder  # Generates .icns and .ico automatically
```

### Option 2: Manual Icon Creation
1. Start with a 512x512 PNG image named `icon.png`
2. Convert to `.icns` for macOS: `sips -s format icns icon.png -o icon.icns`
3. Convert to `.ico` for Windows using ImageMagick or online converter

## Current Status

- `icon.svg` - Placeholder (needs to be converted to PNG/ICO/ICNS)

Replace the SVG with actual icon files before building for production.

## Tips

- Use a design tool (Figma, Adobe XD, Illustrator) for best results
- Ensure icons look good at small sizes (16x16, 32x32)
- Test icons on each platform before release
- Consider app branding and consistency across platforms
