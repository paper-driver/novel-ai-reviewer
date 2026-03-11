# Artist Tag Extraction & Sorting Logic

## Quick Answer

**Q: Are you sorting based on artist tag combination including its order and how many "{}" or "[]" used?**

**A: YES and YES and YES!**
- ✅ **YES by order** - `{artist: bob}, {artist: alice}` ≠ `{artist: alice}, {artist: bob}` (different folders!)
- ✅ **YES by combination** - Different artist sets create different groups
- ✅ **YES by bracket type/count** - `{artist: name}` ≠ `[artist: name]` ≠ `artist: name` (all different!)

---

## The Extraction Algorithm (Step by Step)

### Step 1: Pattern Matching (Bracket-Preserving)

The regex pattern now **captures and preserves** bracket types and counts:

```regex
/([{\[\(]*)\s*artist:\s*([^}\]\),]+)\s*([}\]\)]*)/gi
```

**Breaking it down:**
- `([{\[\(]*)` = **CAPTURE** opening brackets: `{`, `[`, `(`, or multiples like `{{{`
- `\s*artist:\s*` = Match "artist:" with optional whitespace
- `([^}\]\),]+)` = **CAPTURE** the artist name
- `([}\]\)]*)` = **CAPTURE** closing brackets: `}`, `]`, `)`, or multiples like `}}}`

**What this means:**
```
{artist: alice}        → Captures: open="{", name="alice", close="}"
[artist: alice]        → Captures: open="[", name="alice", close="]"  (DIFFERENT!)
{{{artist: alice}}}    → Captures: open="{{{", name="alice", close="}}}" (ALSO DIFFERENT!)
artist: alice          → Captures: open="", name="alice", close="" (DIFFERENT FROM BOTH!)
```

### Step 2: Reconstruct with Brackets (Preserve Type & Count)

After regex capture, **reconstruct** the artist signature **WITH brackets**:

```javascript
const artistWithBrackets = openBrackets + artistName + closeBrackets;
// "{" + "alice" + "}" → "{alice}"
// "[" + "alice" + "]" → "[alice]"
// "{{{" + "alice" + "}}}" → "{{{alice}}}"
// "" + "alice" + "" → "alice"
```

These are now **completely different** artist tags!

### Step 3: Store in Array (Preserve Order)

Use an **array** to preserve insertion order (not a Set):

```javascript
const artists = [];  // Array preserves order
// ... collect all artists ...
artists.push(artistWithBrackets);
```

**Why an array?** The order artists appear in the prompt matters for grouping!

### Step 4: Return AS-IS (No Sorting)

```javascript
return artists;  // Return in original prompt order - NO SORTING!
```

**Example:**
```
Prompt: bob, alice, charlie
Extracted: [bob, alice, charlie]
         ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
         SAME ORDER AS PROMPT!
```

---

## Real-World Examples

### Example 1: Same Artists, Different Bracket Types (NOW DIFFERENT!)

**Image A:**
```
Prompt: "1girl, {artist: alice}, [artist: bob}"
Extracted: ["{alice}", "[bob}"]
Folder:    "{alice} - [bob}"
```

**Image B:**
```
Prompt: "1girl, [artist: alice}, {artist: bob}"
Extracted: ["[alice}", "{bob}"]
Folder:    "[alice} - {bob}" ← DIFFERENT FOLDER!
```

❌ **Result: Image A and Image B go in DIFFERENT folders** (because bracket types differ)

### Example 2: Same Artists, Different Order (NOW DIFFERENT!)

**Image C:**
```
Prompt: "1girl, {artist: bob}, {artist: alice}"
Extracted: ["{bob}", "{alice}"]
Folder:    "{bob} - {alice}"
```

**Image D:**
```
Prompt: "1girl, {artist: alice}, {artist: bob}"
Extracted: ["{alice}", "{bob}"]
Folder:    "{alice} - {bob}" ← DIFFERENT FOLDER!
```

❌ **Result: Image C and Image D go in DIFFERENT folders** (because order differs)

### Example 3: Triple Nested Brackets (NOW DIFFERENT!)

**Image E:**
```
Prompt: "{{{artist: alice}}}"
Extracted: ["{{{alice}}}"]
Folder:    "{{{alice}}}"
```

**Image F:**
```
Prompt: "{{artist: alice}}"
Extracted: ["{{alice}}"]
Folder:    "{{alice}}" ← DIFFERENT FOLDER!
```

❌ **Result: Bracket count matters - different folder even with same artist**

### Example 4: Mixed Bracket Types

**Image G:**
```
Prompt: "[artist: alice], {artist: bob}, artist: charlie"
Extracted: ["[alice]", "{bob}", "charlie"]
Folder:    "[alice] - {bob} - charlie"
```

**Image H:**
```
Prompt: "[artist: alice], {artist: bob}, artist: charlie"
Extracted: ["[alice]", "{bob}", "charlie"]
Folder:    "[alice] - {bob} - charlie" ← SAME FOLDER!
```

✅ **Result: Identical prompts = same folder** (exact order and brackets match)

---

## What Gets Preserved

### ✅ PRESERVED / AFFECTS GROUPING

- **Order in prompt**: `{alice}, {bob}` ≠ `{bob}, {alice}`
- **Bracket type**: `{artist}` ≠ `[artist]` ≠ `(artist)` ≠ `artist`
- **Bracket count**: `{artist}` ≠ `{{artist}}` ≠ `{{{artist}}}`
- **Artist names**: Different artists = different groups

### ❌ IGNORED / DOESN'T AFFECT GROUPING

- **Spacing/whitespace**: `{artist:alice}` = `{ artist : alice }`
- **Exact duplicate entries**: `{alice}, {alice}` → stored once

---

## Folder Naming

After artists are extracted and sorted, the folder name is created:

```javascript
let folderName = artistKey.replace(/ \| /g, ' - ');
// "badapple1003 | butcha-u | cor369" → "badapple1003 - butcha-u - cor369"
```

**Character sanitization:**
- Removes: `/`, null characters, Windows-invalid chars
- All artists separated by: ` - ` (space-dash-space)

**Length limits:**
- **Max folder name**: 255 characters (macOS)
- **If exceeded**: Truncates + adds 8-char MD5 hash for uniqueness

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Prompt from PNG metadata                                     │
│ "{artist: bob}, [artist: alice], (artist: charlie}"         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Regex Pattern Matching     │
        │ (Bracket-agnostic)         │
        │ Captures: bob, alice, charlie
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Clean Up Names             │
        │ Remove brackets/braces     │
        │ Result: bob, alice, charlie
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Store in Set (dedupe)      │
        │ {bob, alice, charlie}      │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ SORT ALPHABETICALLY ⭐     │
        │ [alice, bob, charlie]      │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Join with " - "            │
        │ "alice - bob - charlie"    │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Folder Name Created!       │
        │ ✅ Image goes here         │
        └────────────────────────────┘
```

---

## Summary Table

| Attribute | Affects Grouping? | Example |
|-----------|------------------|---------|
| Artist names | ✅ YES | `alice` vs `bob` = different groups |
| Order in prompt | ✅ YES | `{alice}, {bob}` ≠ `{bob}, {alice}` |
| Bracket type | ✅ YES | `{artist}` ≠ `[artist]` ≠ `artist` |
| Bracket count | ✅ YES | `{artist}` ≠ `{{artist}}` ≠ `{{{artist}}}` |
| Spacing | ❌ NO | `{artist:name}` = `{ artist : name }` |

---

## Code Location

- **Extraction function**: `extractArtistTags()` at line ~727 in `server.js`
- **Key line**: `return Array.from(artists).sort();` (line 758)
- **Sanitization**: `sanitizeFolderName()` at line ~703
- **Used in endpoints**: Both `/api/group-by-artists/:folder` and `/api/group-by-artists-path`

