# Markdown Memory Documents — Design

## Problem

Facts are extracted from LLM conversations and stored as structured records in IndexedDB. Users can confirm/reject them via cards, but there's no way to view memories as coherent prose, edit them in context, deduplicate across extractions, or sync them to disk. The current markdown export is a one-shot dump with no round-trip editing or intelligent merging.

## Solution

Add **Memory Documents** as a curated layer on top of the existing fact pipeline. Each schema category gets a markdown document. When facts are confirmed, an LLM merges them into the relevant document — updating existing entries, removing duplicates, adding detail. Users review a diff before applying. Documents are viewable and editable in a new side panel tab with a split-view editor option.

## Data Model

New `MemoryDocument` type stored in a `documents` IndexedDB object store (DB version bump to 2):

```ts
interface MemoryDocument {
  id: string;            // matches categoryId (e.g. "work", "health")
  categoryId: string;    // links to schema category
  title: string;         // category name (e.g. "Work & Career")
  content: string;       // the markdown body
  version: number;       // incremented on each merge/edit
  history: Array<{       // last 20 versions for undo
    content: string;
    version: number;
    timestamp: number;
    source: 'merge' | 'manual-edit';
  }>;
  updatedAt: number;
  syncedAt: number | null;  // last filesystem write timestamp
}
```

Documents are created lazily — a category only gets a document when its first fact is confirmed and merged. The `history` array is capped at 20 entries.

## LLM Merge Flow

When the user confirms a fact (or batch of facts for a category):

1. Collect all newly confirmed facts for the category
2. Load the existing document content (empty string if first time)
3. Build a merge prompt with the current content + new facts
4. LLM returns the full updated markdown
5. Compute a line-by-line diff between old and new content
6. Show diff in the Documents tab for user review
7. On approve: update document in IndexedDB, bump version, push old content to history, trigger filesystem sync
8. On reject: facts stay confirmed in the facts store but aren't merged. User can retry or edit manually

### Merge Prompt

Separate from the extraction prompt — different task (synthesis vs extraction):

```
You are maintaining a personal knowledge document in markdown.
Below is the current document, followed by new facts to integrate.

Rules:
- Update existing entries if new facts add detail or correct them
- Remove duplicates — prefer the more detailed version
- Keep the document well-organized with clear headings
- Preserve any manual edits the user has made
- Return ONLY the updated markdown, no explanation

Current document:
---
{existing content}
---

New facts to integrate:
{list of facts with key, value, confidence, evidence}
```

Uses the same provider/model configured for extraction.

## UI: Documents Tab

Fifth tab added to the side panel (Dashboard, Facts, Schema, Settings, **Documents**).

### Documents List View

- One card per category document that exists (only categories with merged content)
- Each card shows: category name, last updated, word count, sync status
- Click to open editor
- Pending merge banner: "3 new facts ready to merge — Review"

### Editor (Side Panel)

Tabbed Edit/Preview in the ~350px side panel:

- **Edit tab**: monospace textarea, full-width raw markdown editing
- **Preview tab**: rendered markdown (headings, bullets, bold/italic)
- Top bar: document title, back arrow, save button, pop-out button, sync/download button
- Save bumps version, pushes to history, triggers sync

### Editor (Pop-Out Window)

A "pop out" button opens a new browser window with a full split-view editor:

- Left pane: raw markdown textarea
- Right pane: rendered markdown preview
- Same top bar controls as the panel editor
- Communicates with IndexedDB directly (same extension origin)

### Diff Review View

Overlays the editor when a merge is pending approval:

- Before/after with green (additions) and red (deletions) line highlighting
- Simple line-based LCS diff (~60 lines, no external library)
- Two buttons: "Apply" and "Discard"

### Version History

- Accessible from the editor toolbar
- Shows list of previous versions with timestamp and source (merge vs manual edit)
- Click to preview, button to restore (creates a new version with `source: 'manual-edit'`)

## Markdown Rendering

Document content is simple markdown (headings, bullets, bold, italic). A lightweight renderer handles this — either a ~50-line custom renderer or `snarkdown` (1KB library). No need for a full markdown parser.

## Filesystem Sync

### Chromium — Bound Folder with Auto-Sync

- User picks a folder via `showDirectoryPicker()` (File System Access API)
- Folder handle persisted in IndexedDB, re-granted on restart via `queryPermission()` / `requestPermission()`
- On every document save (merge approval or manual edit), writes `{category-slug}.md` (e.g. `work-career.md`)
- `syncedAt` timestamp tracks last write
- Sync status indicator on document cards: synced / pending / no folder set

### Firefox — Manual Export/Import

- **Export all docs**: downloads a `.zip` of all `.md` files
- **Import docs**: file picker for `.md` files, parsed back into IndexedDB
- Per-document buttons in editor: "Download .md" and "Load .md"

### Edge Cases

- Deleted category: document stays in IndexedDB (orphaned but preserved). File on disk not deleted
- Renamed category: document `title` updates. New filename on next sync. Old file stays on disk
- New category: no document created until facts are merged into it
- External edits: user re-imports the file. Replaces IndexedDB content, bumps version

## End-to-End Flow

### First-Time User

1. Captures conversation, confirms 5 facts across "Work" and "Technology"
2. LLM creates fresh markdown from facts (no existing doc)
3. Diff: empty to new content. User approves
4. Two documents appear in Documents tab
5. User binds a folder — two `.md` files written to disk

### Returning User

1. Captures another conversation, confirms 3 "Work" facts
2. LLM receives existing doc + new facts
3. Updates an entry, adds one new, skips one already covered
4. Diff highlights changes. User approves
5. Version increments, history entry stored, file updated on disk

### Manual Editing

1. Opens doc in editor, switches to Edit tab
2. Rewrites a section, deletes outdated info
3. Saves — version bumps, synced to disk
4. Can pop out for more space

## Decision Summary

| Decision | Choice |
|----------|--------|
| Storage | IndexedDB + filesystem sync |
| Organization | One doc per category |
| Fact flow | LLM-assisted merge on confirm |
| Review | Diff view, require approval |
| Editor | Tabbed edit/preview in panel + pop-out split view |
| Chromium sync | Bound folder, auto-write |
| Firefox sync | Manual export/import buttons |
| History | Version array in IndexedDB, capped at 20 |
