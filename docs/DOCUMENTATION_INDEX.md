# 📚 Project Documentation Index

## Overview

**Novel AI Reviewer** is an Angular-based application for organizing, viewing, and rating AI-generated artwork. It includes a sophisticated AI feedback system that learns from your corrections.

---

## 📁 Documentation Structure

### 🎯 For Users

#### [FEEDBACK_SYSTEM.md](./FEEDBACK_SYSTEM.md) - **START HERE**
Everything you need to use the feedback system:
- Quick start guide
- How to submit feedback
- Your rating patterns and statistics
- Troubleshooting guide
- System status and validation results

**Read this if**: You want to understand how feedback works and use it effectively.

---

### 🔧 For Developers

#### [ARCHITECTURE.md](./ARCHITECTURE.md)
Deep technical documentation:
- System architecture diagram
- File structure and locations
- Backend endpoint details
- Frontend service methods
- Data flow diagrams
- Component scoring system
- Recent code changes
- Testing procedures

**Read this if**: You need to modify code, add features, or debug issues.

---

### 📋 Root Directory Files

#### Project Documentation Files (Archived)
The following legacy documentation files have been consolidated into the files above:

| Old File | Consolidated Into |
|----------|-------------------|
| `FEEDBACK_QUICK_START.md` | `docs/FEEDBACK_SYSTEM.md` |
| `FEEDBACK_CODE_CHANGES.md` | `docs/ARCHITECTURE.md` |
| `FEEDBACK_INVESTIGATION_RESULTS.md` | `docs/ARCHITECTURE.md` |
| `FEEDBACK_COMPLETE_SUMMARY.md` | `docs/FEEDBACK_SYSTEM.md` |
| `FEEDBACK_IMPLEMENTATION_SUMMARY.md` | `docs/ARCHITECTURE.md` |
| `FEEDBACK_ISSUE_AND_FIX.md` | `docs/ARCHITECTURE.md` |
| `FEEDBACK_QUICK_REFERENCE.md` | `docs/FEEDBACK_SYSTEM.md` |
| `FEEDBACK_VISUAL_GUIDE.md` | `docs/FEEDBACK_SYSTEM.md` |
| `FEEDBACK_DOCUMENTATION_INDEX.md` | `docs/DOCUMENTATION_INDEX.md` |

**Note**: Old files are still in root directory but documentation is maintained in `/docs` folder.

---

### 🎨 Feature Documentation (Root)

#### `ARTIST_GROUPING_FEATURE.md`
Guide to artist grouping functionality:
- How the grouping system works
- API endpoints for grouping
- Configuration options

#### `ARTIST_SORTING_EXPLANATION.md`
Details on artist sorting algorithms:
- Sorting strategies
- Performance considerations

#### `INCREMENTAL_SORTING.md`
Documentation on incremental sorting:
- Algorithm description
- Use cases and benefits

---

### 🚀 Project Setup & Status (Root)

#### `QUICK_START_AI_RATING.md`
Quick start guide for the full application:
- How to run the app
- Basic usage instructions

#### `FINAL_STATUS_REPORT.md`
Latest project status:
- Completed features
- Known issues
- Next steps

#### `DELIVERY_SUMMARY.md`
Project delivery information

---

## 🎯 Quick Navigation

### I want to...

**...use the feedback system**
→ Read: [FEEDBACK_SYSTEM.md](./FEEDBACK_SYSTEM.md)

**...understand the architecture**
→ Read: [ARCHITECTURE.md](./ARCHITECTURE.md)

**...run the application**
→ Read: [../QUICK_START_AI_RATING.md](../QUICK_START_AI_RATING.md)

**...learn about artist grouping**
→ Read: [../ARTIST_GROUPING_FEATURE.md](../ARTIST_GROUPING_FEATURE.md)

**...check project status**
→ Read: [../FINAL_STATUS_REPORT.md](../FINAL_STATUS_REPORT.md)

---

## 📊 System Status

### Feedback System
```
Status: ✅ Fully Operational
Total Entries: 47
Valid Entries: 47 (100%)
Corrupted: 0
Last Tested: 2026-03-13
```

### Application
```
Framework: Angular 16+
Backend: Node.js Express
Database: Local JSON files
API: Google Cloud Vision
Port: 3000
```

### Recent Changes (ai-poc-2 branch)
```
✅ Fixed sourcePath parameter passing
✅ Feedback application verified working
✅ All 47 entries validated
✅ Component score corrections applied
✅ Server logging confirmed
```

---

## 🔗 File Locations

### Source Code
```
/Users/leonmao/Documents/Projects/novel-ai-reviewer/
├── src/                    # Angular source code
├── server.js              # Express backend
├── angular.json           # Angular config
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config
```

### Data Storage
```
/Volumes/WD_BLACK/private/NovelAI/SortByArtist/
├── .ai-feedback.json      # User feedback entries (47 entries)
├── .ai-feedback.json.backup.* # Backup from cleanup
└── [artist folders]/      # Image storage
```

### Documentation
```
docs/
├── FEEDBACK_SYSTEM.md     # User guide for feedback
├── ARCHITECTURE.md        # Technical reference
└── DOCUMENTATION_INDEX.md # This file
```

---

## 🚀 Getting Started

### For New Users
1. Read: [FEEDBACK_SYSTEM.md](./FEEDBACK_SYSTEM.md) - Quick Start section
2. Analyze an image in the app
3. Submit feedback using "💭 Give Feedback" button
4. Check your feedback with the API

### For Developers
1. Read: [ARCHITECTURE.md](./ARCHITECTURE.md) - System Architecture section
2. Review: `server.js` - Backend implementation
3. Review: `src/app/services/ai-feedback.service.ts` - Frontend service
4. Run: Manual tests from Architecture guide

### For Deployment
1. Check: [../FINAL_STATUS_REPORT.md](../FINAL_STATUS_REPORT.md)
2. Run: `npm run build` to build Angular
3. Start: `node server.js` to start backend
4. Test: Verify feedback endpoints with curl commands

---

## 📞 Support

### Common Issues

**Q: Feedback not applying?**
- A: See troubleshooting in [FEEDBACK_SYSTEM.md](./FEEDBACK_SYSTEM.md#troubleshooting)

**Q: Where is feedback stored?**
- A: See storage in [FEEDBACK_SYSTEM.md](./FEEDBACK_SYSTEM.md#-feedback-file-structure)

**Q: How do I debug the API?**
- A: See testing in [ARCHITECTURE.md](./ARCHITECTURE.md#testing)

---

## 📝 Document Maintenance

### Last Updated
- `FEEDBACK_SYSTEM.md`: 2026-03-13
- `ARCHITECTURE.md`: 2026-03-13
- `DOCUMENTATION_INDEX.md`: 2026-03-13

### Future Cleanup
Consider removing/archiving these root-level files:
- `FEEDBACK_QUICK_START.md`
- `FEEDBACK_CODE_CHANGES.md`
- `FEEDBACK_INVESTIGATION_RESULTS.md`
- `FEEDBACK_COMPLETE_SUMMARY.md`
- `FEEDBACK_IMPLEMENTATION_SUMMARY.md`
- `FEEDBACK_ISSUE_AND_FIX.md`
- `FEEDBACK_QUICK_REFERENCE.md`
- `FEEDBACK_VISUAL_GUIDE.md`

(Keep for now as reference, but new documentation goes in `/docs`)
