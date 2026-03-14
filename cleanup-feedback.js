#!/usr/bin/env node

/**
 * Cleanup Feedback File Utility
 * 
 * This script cleans up the .ai-feedback.json file by:
 * 1. Removing entries where the image file no longer exists
 * 2. Backing up the original file
 * 3. Creating a new clean feedback file
 * 4. Providing a detailed report of what was removed
 */

const fs = require('fs');
const path = require('path');

function cleanupFeedback(sourcePath) {
  const feedbackFile = path.join(sourcePath, '.ai-feedback.json');
  const backupFile = path.join(sourcePath, `.ai-feedback.json.backup.${Date.now()}`);

  // Check if feedback file exists
  if (!fs.existsSync(feedbackFile)) {
    console.log(`✓ No feedback file found at ${feedbackFile}`);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Feedback File Cleanup Utility');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Read feedback file
  let feedbackData;
  try {
    feedbackData = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
  } catch (err) {
    console.error('❌ Error reading feedback file:', err.message);
    return;
  }

  const originalCount = feedbackData.entries ? feedbackData.entries.length : 0;
  console.log(`📊 Original feedback entries: ${originalCount}\n`);

  if (!feedbackData.entries || !Array.isArray(feedbackData.entries)) {
    console.error('❌ Invalid feedback file format');
    return;
  }

  // Analyze each entry
  const validEntries = [];
  const removedEntries = [];
  let filesChecked = 0;
  let filesFound = 0;

  feedbackData.entries.forEach((entry, index) => {
    const imageId = entry.imageId;
    
    // Try to find the image file in the source folder
    let found = false;
    
    try {
      // Search for the file in subdirectories
      const walkDir = (dir) => {
        if (found) return;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (found) return;
          
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory() && !item.startsWith('.')) {
            walkDir(itemPath);
          } else if (stat.isFile() && item === imageId) {
            found = true;
            filesFound++;
            return;
          }
        }
      };
      
      walkDir(sourcePath);
      filesChecked++;
      
      if (found) {
        validEntries.push(entry);
      } else {
        removedEntries.push({
          imageId,
          userScore: entry.userScore,
          aiScore: entry.aiScore,
          components: entry.components
        });
      }
    } catch (err) {
      // On error, keep the entry (safer than deleting)
      validEntries.push(entry);
    }
  });

  console.log(`✓ Checked ${filesChecked} entries`);
  console.log(`✓ Found valid files: ${filesFound}`);
  console.log(`❌ Corrupted/missing files: ${removedEntries.length}\n`);

  if (removedEntries.length === 0) {
    console.log('✓ All feedback entries are valid! No cleanup needed.\n');
    return;
  }

  // Show removed entries
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Removed Entries (images not found on disk)');
  console.log('═══════════════════════════════════════════════════════════\n');

  removedEntries.slice(0, 10).forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.imageId.substring(0, 80)}`);
    if (entry.imageId.length > 80) {
      console.log(`   ...${entry.imageId.substring(entry.imageId.length - 20)}`);
    }
    console.log(`   User Score: ${entry.userScore}, AI Score: ${entry.aiScore}`);
    console.log(`   Components: ${JSON.stringify(entry.components).substring(0, 60)}`);
    console.log();
  });

  if (removedEntries.length > 10) {
    console.log(`... and ${removedEntries.length - 10} more entries\n`);
  }

  // Backup original file
  try {
    fs.copyFileSync(feedbackFile, backupFile);
    console.log(`✓ Original file backed up to:`);
    console.log(`  ${backupFile}\n`);
  } catch (err) {
    console.error('❌ Error creating backup:', err.message);
    return;
  }

  // Write cleaned feedback file
  try {
    const cleanedData = {
      entries: validEntries,
      clearedAt: new Date().toISOString(),
      originalCount: originalCount,
      removedCount: removedEntries.length,
      validCount: validEntries.length
    };

    fs.writeFileSync(feedbackFile, JSON.stringify(cleanedData, null, 2));
    console.log('✓ Cleaned feedback file saved:\n');
    console.log(`  Original entries: ${originalCount}`);
    console.log(`  Valid entries kept: ${validEntries.length}`);
    console.log(`  Corrupted entries removed: ${removedEntries.length}`);
    console.log(`\n✓ File location: ${feedbackFile}\n`);

    if (validEntries.length === 0) {
      console.log('⚠️  All feedback entries were corrupted!');
      console.log('You can now start fresh with new feedback.\n');
    }
  } catch (err) {
    console.error('❌ Error writing cleaned feedback file:', err.message);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Cleanup Complete!');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (validEntries.length === 0) {
    console.log('Next steps:');
    console.log('1. Restart the application');
    console.log('2. Start providing feedback for images');
    console.log('3. Your feedback will now be properly tracked!\n');
  }
}

// Main execution
const sourcePath = process.argv[2];

if (!sourcePath) {
  console.log('Usage: node cleanup-feedback.js <source-folder-path>');
  console.log('\nExample:');
  console.log('  node cleanup-feedback.js "/Volumes/WD_BLACK/private/NovelAI/SortByArtist"\n');
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Source folder not found: ${sourcePath}`);
  process.exit(1);
}

cleanupFeedback(sourcePath);
